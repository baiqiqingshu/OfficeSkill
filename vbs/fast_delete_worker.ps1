[CmdletBinding(DefaultParameterSetName = 'Clipboard')]
param(
    [Parameter(ParameterSetName = 'Clipboard')]
    [switch] $FromClipboard,

    [Parameter(Mandatory, ParameterSetName = 'File')]
    [string] $SelectionFile,

    [switch] $DryRun
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$deleteEngineSource = @'
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;

public sealed class FastDeleteJob
{
    private const uint INVALID_FILE_ATTRIBUTES = 0xFFFFFFFF;
    private const int ERROR_FILE_NOT_FOUND = 2;
    private const int ERROR_PATH_NOT_FOUND = 3;
    private const int ERROR_ACCESS_DENIED = 5;
    private const int ERROR_NO_MORE_FILES = 18;
    private const int ERROR_INVALID_PARAMETER = 87;
    private const int ERROR_DIR_NOT_EMPTY = 145;
    private const int FIND_FIRST_EX_LARGE_FETCH = 2;
    private const int FIND_DATA_SIZE = 592;
    private const int FIND_DATA_NAME_OFFSET = 44;
    private const int MAX_ERRORS = 20;
    private const int PROGRESS_STRIDE = 128;
    private const int MAX_WORKERS = 12;
    private const int MIN_PARALLEL_ENTRIES = 512;
    private const string ERROR_SEPARATOR = " — ";
    private const uint FILE_SHARE_READ_WRITE = 3;
    private const uint OPEN_EXISTING = 3;
    private const int STORAGE_DEVICE_SEEK_PENALTY_PROPERTY = 7;
    private const int STORAGE_PROPERTY_STANDARD_QUERY = 0;
    private const int IOCTL_STORAGE_QUERY_PROPERTY = 0x2D1400;
    private static readonly IntPtr INVALID_HANDLE_VALUE = new IntPtr(-1);

    private readonly ConcurrentQueue<string> errors = new ConcurrentQueue<string>();
    private long deletedFiles;
    private long deletedDirectories;
    private int errorCount;
    private string currentPath;
    private long progressCounter;

    public long DeletedFiles { get { return Interlocked.Read(ref deletedFiles); } }
    public long DeletedDirectories { get { return Interlocked.Read(ref deletedDirectories); } }
    public int ErrorCount { get { return Volatile.Read(ref errorCount); } }
    public string CurrentPath { get { return Volatile.Read(ref currentPath); } }
    public Task Task { get; private set; }

    public string ErrorMessage
    {
        get { return String.Join(Environment.NewLine, errors.ToArray()); }
    }

    public static FastDeleteJob Start(string path)
    {
        FastDeleteJob job = new FastDeleteJob();
        job.Task = Task.Factory.StartNew(
            delegate { job.Run(path); },
            CancellationToken.None,
            TaskCreationOptions.LongRunning,
            TaskScheduler.Default);
        return job;
    }

    private sealed class DirectoryEntry
    {
        public string Path;
        public uint Attributes;
    }

    private struct FileEntry
    {
        public string Path;
        public uint Attributes;
    }

    private delegate void SliceBody(int start, int end);

    private void Run(string path)
    {
        string root = ToLongPath(path);
        try
        {
            uint attributes = GetFileAttributesW(root);
            if (attributes == INVALID_FILE_ATTRIBUTES)
            {
                AddError(root, Marshal.GetLastWin32Error());
                return;
            }

            Volatile.Write(ref currentPath, ToDisplayPath(root));

            if ((attributes & (uint)FileAttributes.Directory) == 0)
            {
                DeleteFile(root, attributes);
                return;
            }

            DirectoryEntry rootEntry = new DirectoryEntry();
            rootEntry.Path = root;
            rootEntry.Attributes = attributes;

            if ((attributes & (uint)FileAttributes.ReparsePoint) != 0)
            {
                RemoveDirectoryEntry(rootEntry, null);
                return;
            }

            List<FileEntry> files = new List<FileEntry>();
            List<DirectoryEntry> directories = new List<DirectoryEntry>();
            directories.Add(rootEntry);
            Collect(rootEntry, files, directories);

            int workers = ChooseWorkerCount(files.Count + directories.Count, root);

            RunSlices(files.Count, workers, delegate(int start, int end)
            {
                for (int index = start; index < end; index++)
                {
                    FileEntry entry = files[index];
                    DeleteFile(entry.Path, entry.Attributes);
                }
            });
            files = null;

            directories.Sort(CompareByPathLengthDescending);
            ConcurrentQueue<DirectoryEntry> retries = new ConcurrentQueue<DirectoryEntry>();
            RunSlices(directories.Count, workers, delegate(int start, int end)
            {
                for (int index = start; index < end; index++)
                {
                    RemoveDirectoryEntry(directories[index], retries);
                }
            });
            DrainDirectoryRetries(retries, workers);
        }
        catch (Exception exception)
        {
            AddError(root, exception.Message);
        }
    }

    private void Collect(DirectoryEntry rootEntry, List<FileEntry> files, List<DirectoryEntry> directories)
    {
        IntPtr buffer = Marshal.AllocHGlobal(FIND_DATA_SIZE);
        try
        {
            Stack<DirectoryEntry> pending = new Stack<DirectoryEntry>();
            pending.Push(rootEntry);
            int visited = 0;

            while (pending.Count > 0)
            {
                DirectoryEntry current = pending.Pop();
                visited++;
                if ((visited & 63) == 0)
                {
                    Volatile.Write(ref currentPath, ToDisplayPath(current.Path));
                }

                string pattern = Combine(current.Path, "*");
                IntPtr handle = FindFirstFileExW(
                    pattern, FINDEX_INFO_LEVELS.FindExInfoBasic, buffer,
                    FINDEX_SEARCH_OPS.FindExSearchNameMatch, IntPtr.Zero,
                    FIND_FIRST_EX_LARGE_FETCH);

                if (handle == INVALID_HANDLE_VALUE &&
                    Marshal.GetLastWin32Error() == ERROR_INVALID_PARAMETER)
                {
                    handle = FindFirstFileExW(
                        pattern, FINDEX_INFO_LEVELS.FindExInfoStandard, buffer,
                        FINDEX_SEARCH_OPS.FindExSearchNameMatch, IntPtr.Zero, 0);
                }

                if (handle == INVALID_HANDLE_VALUE)
                {
                    int error = Marshal.GetLastWin32Error();
                    if (error != ERROR_FILE_NOT_FOUND && error != ERROR_PATH_NOT_FOUND)
                    {
                        AddError(current.Path, error);
                    }
                    continue;
                }

                try
                {
                    while (true)
                    {
                        uint attributes = (uint)Marshal.ReadInt32(buffer);
                        string name = Marshal.PtrToStringUni(
                            new IntPtr(buffer.ToInt64() + FIND_DATA_NAME_OFFSET));

                        if (name != "." && name != "..")
                        {
                            string child = Combine(current.Path, name);
                            if ((attributes & (uint)FileAttributes.Directory) != 0)
                            {
                                DirectoryEntry entry = new DirectoryEntry();
                                entry.Path = child;
                                entry.Attributes = attributes;
                                directories.Add(entry);
                                if ((attributes & (uint)FileAttributes.ReparsePoint) == 0)
                                {
                                    pending.Push(entry);
                                }
                            }
                            else
                            {
                                FileEntry entry = new FileEntry();
                                entry.Path = child;
                                entry.Attributes = attributes;
                                files.Add(entry);
                            }
                        }

                        if (!FindNextFileW(handle, buffer))
                        {
                            int error = Marshal.GetLastWin32Error();
                            if (error != ERROR_NO_MORE_FILES)
                            {
                                AddError(current.Path, error);
                            }
                            break;
                        }
                    }
                }
                finally
                {
                    FindClose(handle);
                }
            }
        }
        finally
        {
            Marshal.FreeHGlobal(buffer);
        }
    }

    private static void RunSlices(int count, int workers, SliceBody body)
    {
        if (count <= 0)
        {
            return;
        }

        int active = workers > 1 ? Math.Min(workers, count) : 1;
        if (active < 2)
        {
            body(0, count);
            return;
        }

        int slice = (count + active - 1) / active;
        Thread[] threads = new Thread[active];
        for (int index = 0; index < active; index++)
        {
            int start = index * slice;
            int end = Math.Min(count, start + slice);
            threads[index] = new Thread(delegate() { body(start, end); });
            threads[index].IsBackground = true;
            threads[index].Start();
        }
        for (int index = 0; index < active; index++)
        {
            threads[index].Join();
        }
    }

    private void DrainDirectoryRetries(ConcurrentQueue<DirectoryEntry> retries, int workers)
    {
        while (true)
        {
            List<DirectoryEntry> batch = new List<DirectoryEntry>();
            DirectoryEntry queued;
            while (retries.TryDequeue(out queued))
            {
                batch.Add(queued);
            }
            if (batch.Count == 0)
            {
                return;
            }

            List<DirectoryEntry> again = new List<DirectoryEntry>();
            object sync = new object();
            RunSlices(batch.Count, workers, delegate(int start, int end)
            {
                for (int index = start; index < end; index++)
                {
                    if (!TryRemoveDirectory(batch[index]))
                    {
                        lock (sync)
                        {
                            again.Add(batch[index]);
                        }
                    }
                }
            });

            if (again.Count == 0)
            {
                return;
            }

            if (again.Count >= batch.Count)
            {
                for (int index = 0; index < again.Count; index++)
                {
                    AddError(again[index].Path, ERROR_DIR_NOT_EMPTY);
                }
                return;
            }

            for (int index = 0; index < again.Count; index++)
            {
                retries.Enqueue(again[index]);
            }
        }
    }

    private void DeleteFile(string path, uint attributes)
    {
        if ((attributes & (uint)FileAttributes.ReadOnly) != 0)
        {
            ClearReadOnly(path, attributes);
        }

        if (DeleteFileW(path))
        {
            Interlocked.Increment(ref deletedFiles);
            UpdateProgress(path);
            return;
        }

        int error = Marshal.GetLastWin32Error();
        if (error == ERROR_ACCESS_DENIED)
        {
            uint current = GetFileAttributesW(path);
            if (current != INVALID_FILE_ATTRIBUTES &&
                (current & (uint)FileAttributes.ReadOnly) != 0)
            {
                ClearReadOnly(path, current);
                if (DeleteFileW(path))
                {
                    Interlocked.Increment(ref deletedFiles);
                    UpdateProgress(path);
                    return;
                }
                error = Marshal.GetLastWin32Error();
            }
        }

        if (error == ERROR_FILE_NOT_FOUND || error == ERROR_PATH_NOT_FOUND)
        {
            Interlocked.Increment(ref deletedFiles);
            return;
        }

        AddError(path, error);
    }

    private void RemoveDirectoryEntry(DirectoryEntry entry, ConcurrentQueue<DirectoryEntry> retries)
    {
        if (!TryRemoveDirectory(entry) && retries != null)
        {
            retries.Enqueue(entry);
        }
    }

    // Returns false only while the directory still exists because children are
    // still being removed somewhere else; anything else is terminal.
    private bool TryRemoveDirectory(DirectoryEntry entry)
    {
        if ((entry.Attributes & (uint)FileAttributes.ReadOnly) != 0)
        {
            ClearReadOnly(entry.Path, entry.Attributes);
        }

        if (RemoveDirectoryW(entry.Path))
        {
            Interlocked.Increment(ref deletedDirectories);
            UpdateProgress(entry.Path);
            return true;
        }

        int error = Marshal.GetLastWin32Error();
        if (error == ERROR_FILE_NOT_FOUND || error == ERROR_PATH_NOT_FOUND)
        {
            Interlocked.Increment(ref deletedDirectories);
            return true;
        }

        if (error == ERROR_ACCESS_DENIED)
        {
            uint current = GetFileAttributesW(entry.Path);
            if (current != INVALID_FILE_ATTRIBUTES &&
                (current & (uint)FileAttributes.ReadOnly) != 0)
            {
                entry.Attributes = current;
                ClearReadOnly(entry.Path, current);
                if (RemoveDirectoryW(entry.Path))
                {
                    Interlocked.Increment(ref deletedDirectories);
                    UpdateProgress(entry.Path);
                    return true;
                }
                error = Marshal.GetLastWin32Error();
            }
        }

        if (error == ERROR_DIR_NOT_EMPTY)
        {
            return false;
        }

        AddError(entry.Path, error);
        return true;
    }

    private static void ClearReadOnly(string path, uint attributes)
    {
        SetFileAttributesW(path, attributes & ~(uint)FileAttributes.ReadOnly);
    }

    private static int CompareByPathLengthDescending(DirectoryEntry left, DirectoryEntry right)
    {
        return right.Path.Length.CompareTo(left.Path.Length);
    }

    private static int ChooseWorkerCount(int entries, string longRoot)
    {
        int workers = Math.Min(Environment.ProcessorCount, MAX_WORKERS);
        if (workers < 2 || entries < MIN_PARALLEL_ENTRIES)
        {
            return 1;
        }
        if (VolumeIncursSeekPenalty(longRoot))
        {
            return 1;
        }
        return workers;
    }

    private static bool VolumeIncursSeekPenalty(string longPath)
    {
        string volume = ToVolumeDevicePath(longPath);
        if (volume == null)
        {
            return false;
        }

        IntPtr handle = CreateFileW(volume, 0, FILE_SHARE_READ_WRITE, IntPtr.Zero,
            OPEN_EXISTING, 0, IntPtr.Zero);
        if (handle == INVALID_HANDLE_VALUE)
        {
            return false;
        }

        try
        {
            STORAGE_PROPERTY_QUERY query = new STORAGE_PROPERTY_QUERY();
            query.PropertyId = STORAGE_DEVICE_SEEK_PENALTY_PROPERTY;
            query.QueryType = STORAGE_PROPERTY_STANDARD_QUERY;
            DEVICE_SEEK_PENALTY_DESCRIPTOR descriptor = new DEVICE_SEEK_PENALTY_DESCRIPTOR();
            int returned;
            bool ok = DeviceIoControl(handle, IOCTL_STORAGE_QUERY_PROPERTY, ref query,
                Marshal.SizeOf(typeof(STORAGE_PROPERTY_QUERY)), ref descriptor,
                Marshal.SizeOf(typeof(DEVICE_SEEK_PENALTY_DESCRIPTOR)), out returned, IntPtr.Zero);
            return ok && descriptor.IncursSeekPenalty != 0;
        }
        finally
        {
            CloseHandle(handle);
        }
    }

    private static string ToVolumeDevicePath(string longPath)
    {
        if (longPath.Length < 7 || !longPath.StartsWith(@"\\?\", StringComparison.Ordinal))
        {
            return null;
        }
        if (longPath[5] != ':')
        {
            return null;
        }
        return @"\\.\" + longPath.Substring(4, 2);
    }

    private void UpdateProgress(string path)
    {
        long seen = Interlocked.Increment(ref progressCounter);
        if ((seen & (PROGRESS_STRIDE - 1)) == 0)
        {
            Volatile.Write(ref currentPath, ToDisplayPath(path));
        }
    }

    private void AddError(string path, int nativeError)
    {
        AddError(path, new Win32Exception(nativeError).Message);
    }

    private void AddError(string path, string reason)
    {
        int count = Interlocked.Increment(ref errorCount);
        if (count <= MAX_ERRORS)
        {
            errors.Enqueue(ToDisplayPath(path) + ERROR_SEPARATOR + reason);
        }
    }

    private static string ToLongPath(string path)
    {
        string fullPath = Path.GetFullPath(path).TrimEnd('\\', '/');
        if (fullPath.StartsWith(@"\\?\", StringComparison.Ordinal))
        {
            return fullPath;
        }
        if (fullPath.StartsWith(@"\\", StringComparison.Ordinal))
        {
            return @"\\?\UNC\" + fullPath.Substring(2);
        }
        return @"\\?\" + fullPath;
    }

    private static string ToDisplayPath(string path)
    {
        if (path.StartsWith(@"\\?\UNC\", StringComparison.OrdinalIgnoreCase))
        {
            return @"\\" + path.Substring(8);
        }
        if (path.StartsWith(@"\\?\", StringComparison.OrdinalIgnoreCase))
        {
            return path.Substring(4);
        }
        return path;
    }

    private static string Combine(string directory, string name)
    {
        return directory.EndsWith("\\", StringComparison.Ordinal)
            ? directory + name
            : directory + "\\" + name;
    }

    private enum FINDEX_INFO_LEVELS
    {
        FindExInfoStandard,
        FindExInfoBasic
    }

    private enum FINDEX_SEARCH_OPS
    {
        FindExSearchNameMatch,
        FindExSearchLimitToDirectories,
        FindExSearchLimitToDevices
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct STORAGE_PROPERTY_QUERY
    {
        public int PropertyId;
        public int QueryType;
        public byte AdditionalParameters;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct DEVICE_SEEK_PENALTY_DESCRIPTOR
    {
        public int Version;
        public int Size;
        public byte IncursSeekPenalty;
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern uint GetFileAttributesW(string lpFileName);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetFileAttributesW(string lpFileName, uint dwFileAttributes);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr FindFirstFileExW(
        string lpFileName,
        FINDEX_INFO_LEVELS fInfoLevelId,
        IntPtr lpFindFileData,
        FINDEX_SEARCH_OPS fSearchOp,
        IntPtr lpSearchFilter,
        int dwAdditionalFlags);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool FindNextFileW(IntPtr hFindFile, IntPtr lpFindFileData);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool FindClose(IntPtr hFindFile);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool DeleteFileW(string lpFileName);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool RemoveDirectoryW(string lpPathName);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr CreateFileW(
        string lpFileName,
        uint dwDesiredAccess,
        uint dwShareMode,
        IntPtr lpSecurityAttributes,
        uint dwCreationDisposition,
        uint dwFlagsAndAttributes,
        IntPtr hTemplateFile);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool DeviceIoControl(
        IntPtr hDevice,
        int dwIoControlCode,
        ref STORAGE_PROPERTY_QUERY lpInBuffer,
        int nInBufferSize,
        ref DEVICE_SEEK_PENALTY_DESCRIPTOR lpOutBuffer,
        int nOutBufferSize,
        out int lpBytesReturned,
        IntPtr lpOverlapped);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CloseHandle(IntPtr hObject);
}
'@

function Show-Dialog {
    param(
        [string] $Text,
        [string] $Title = '快速永久删除',
        [System.Windows.Forms.MessageBoxButtons] $Buttons =
            [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon] $Icon =
            [System.Windows.Forms.MessageBoxIcon]::Information,
        [System.Windows.Forms.MessageBoxDefaultButton] $DefaultButton =
            [System.Windows.Forms.MessageBoxDefaultButton]::Button1
    )

    $owner = New-Object System.Windows.Forms.Form
    $owner.ShowInTaskbar = $false
    $owner.StartPosition = 'CenterScreen'
    $owner.Size = New-Object System.Drawing.Size(1, 1)
    $owner.Opacity = 0
    $owner.TopMost = $true
    [void] $owner.Show()

    try {
        return [System.Windows.Forms.MessageBox]::Show(
            $owner, $Text, $Title, $Buttons, $Icon, $DefaultButton)
    }
    finally {
        $owner.Close()
        $owner.Dispose()
    }
}

function Get-SelectedPaths {
    if ($PSCmdlet.ParameterSetName -eq 'File') {
        try {
            return @(Get-Content -LiteralPath $SelectionFile -Encoding Unicode)
        }
        finally {
            Remove-Item -LiteralPath $SelectionFile -Force -ErrorAction SilentlyContinue
        }
    }

    # The worker is the only PowerShell process used for toolbar invocation.
    # Clear stale file-drop data, then ask the still-foreground Explorer++ window
    # to copy its current selection.
    [System.Windows.Forms.Clipboard]::Clear()
    Start-Sleep -Milliseconds 30
    [System.Windows.Forms.SendKeys]::SendWait('^c')

    for ($attempt = 0; $attempt -lt 12; $attempt++) {
        $items = [System.Windows.Forms.Clipboard]::GetFileDropList()
        if ($items.Count -gt 0) {
            return @($items | ForEach-Object { [string] $_ })
        }
        Start-Sleep -Milliseconds 100
    }

    return @()
}

function Get-SafeTargets {
    param([string[]] $Paths)

    $unique = New-Object 'System.Collections.Generic.HashSet[string]' (
        [System.StringComparer]::OrdinalIgnoreCase)
    $accepted = New-Object 'System.Collections.Generic.List[string]'
    $rejected = New-Object 'System.Collections.Generic.List[string]'

    foreach ($rawPath in $Paths) {
        if ([string]::IsNullOrWhiteSpace($rawPath)) {
            continue
        }

        try {
            $fullPath = [System.IO.Path]::GetFullPath($rawPath)
            $trimmedPath = $fullPath.TrimEnd('\', '/')
            $rootPath = [System.IO.Path]::GetPathRoot($fullPath).TrimEnd('\', '/')

            if ($trimmedPath.Equals($rootPath, [System.StringComparison]::OrdinalIgnoreCase)) {
                $rejected.Add("已拦截根目录：$fullPath")
                continue
            }

            if (-not [System.IO.File]::Exists($trimmedPath) -and
                -not [System.IO.Directory]::Exists($trimmedPath)) {
                $rejected.Add("目标不存在：$trimmedPath")
                continue
            }

            if ($unique.Add($trimmedPath)) {
                $accepted.Add($trimmedPath)
            }
        }
        catch {
            $rejected.Add("无效路径：$rawPath")
        }
    }

    # If both a parent and one of its children are selected, delete only the parent.
    $ordered = @($accepted | Sort-Object Length)
    $result = New-Object 'System.Collections.Generic.List[string]'
    foreach ($candidate in $ordered) {
        $isNested = $false
        foreach ($parent in $result) {
            if ($candidate.StartsWith(
                    $parent + [System.IO.Path]::DirectorySeparatorChar,
                    [System.StringComparison]::OrdinalIgnoreCase)) {
                $isNested = $true
                break
            }
        }
        if (-not $isNested) {
            $result.Add($candidate)
        }
    }

    [pscustomobject]@{
        Targets  = @($result)
        Rejected = @($rejected)
    }
}

$rawPaths = @(Get-SelectedPaths)
if ($rawPaths.Count -eq 0) {
    [void] (Show-Dialog -Text '未检测到 Explorer++ 中选中的文件夹。请先选中目标，再点击快速删除。')
    exit 1
}

$selection = Get-SafeTargets -Paths $rawPaths
$targets = @($selection.Targets)
if ($targets.Count -eq 0) {
    $details = if ($selection.Rejected.Count -gt 0) {
        "`r`n`r`n" + ($selection.Rejected -join "`r`n")
    }
    else { '' }
    [void] (Show-Dialog -Text ("没有可删除的有效目标。" + $details) -Icon Warning)
    exit 1
}

$previewLimit = 12
$preview = @($targets | Select-Object -First $previewLimit)
$confirmationText = @(
    '将永久删除以下目标，不会进入回收站：'
    ''
    ($preview -join "`r`n")
)
if ($targets.Count -gt $previewLimit) {
    $confirmationText += "……另有 $($targets.Count - $previewLimit) 项"
}
$confirmationText += ''
$confirmationText += '此操作不可撤销。确定继续吗？'

$answer = Show-Dialog -Text ($confirmationText -join "`r`n") `
    -Buttons YesNo -Icon Warning -DefaultButton Button2
if ($answer -ne [System.Windows.Forms.DialogResult]::Yes) {
    exit 0
}

if ($DryRun) {
    [void] (Show-Dialog -Text "安全测试完成：已确认 $($targets.Count) 个目标，未执行删除。")
    exit 0
}

# Compile the native deletion engine only after the user confirms. This keeps
# the confirmation path fast while preserving the optimized deletion path.
Add-Type -TypeDefinition $deleteEngineSource

$form = New-Object System.Windows.Forms.Form
$form.Text = '快速永久删除'
$form.StartPosition = 'CenterScreen'
$form.ClientSize = New-Object System.Drawing.Size(720, 390)
$form.MinimumSize = New-Object System.Drawing.Size(620, 360)
$form.TopMost = $true
$form.MaximizeBox = $false
$form.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 9)

$titleLabel = New-Object System.Windows.Forms.Label
$titleLabel.Location = New-Object System.Drawing.Point(18, 16)
$titleLabel.Size = New-Object System.Drawing.Size(680, 25)
$titleLabel.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 11, [System.Drawing.FontStyle]::Bold)
$titleLabel.Text = '正在永久删除，请勿关闭窗口'

$pathLabel = New-Object System.Windows.Forms.Label
$pathLabel.Location = New-Object System.Drawing.Point(18, 51)
$pathLabel.Size = New-Object System.Drawing.Size(680, 42)
$pathLabel.AutoEllipsis = $true

$activityBar = New-Object System.Windows.Forms.ProgressBar
$activityBar.Location = New-Object System.Drawing.Point(20, 98)
$activityBar.Size = New-Object System.Drawing.Size(678, 18)
$activityBar.Style = [System.Windows.Forms.ProgressBarStyle]::Marquee
$activityBar.MarqueeAnimationSpeed = 24

$statusLabel = New-Object System.Windows.Forms.Label
$statusLabel.Location = New-Object System.Drawing.Point(18, 126)
$statusLabel.Size = New-Object System.Drawing.Size(680, 23)

$overallBar = New-Object System.Windows.Forms.ProgressBar
$overallBar.Location = New-Object System.Drawing.Point(20, 152)
$overallBar.Size = New-Object System.Drawing.Size(678, 20)
$overallBar.Minimum = 0
$overallBar.Maximum = $targets.Count

$detailBox = New-Object System.Windows.Forms.TextBox
$detailBox.Location = New-Object System.Drawing.Point(20, 185)
$detailBox.Size = New-Object System.Drawing.Size(678, 145)
$detailBox.Anchor = 'Top, Bottom, Left, Right'
$detailBox.Multiline = $true
$detailBox.ReadOnly = $true
$detailBox.ScrollBars = 'Vertical'
$detailBox.BackColor = [System.Drawing.SystemColors]::Window

$closeButton = New-Object System.Windows.Forms.Button
$closeButton.Location = New-Object System.Drawing.Point(608, 344)
$closeButton.Size = New-Object System.Drawing.Size(90, 30)
$closeButton.Anchor = 'Bottom, Right'
$closeButton.Text = '关闭'
$closeButton.Enabled = $false
$closeButton.Add_Click({ $form.Close() })

$form.Controls.AddRange(@(
    $titleLabel, $pathLabel, $activityBar, $statusLabel,
    $overallBar, $detailBox, $closeButton
))

$script:index = 0
$script:completed = 0
$script:succeeded = 0
$script:failed = 0
$script:currentTarget = $null
$script:deleteJob = $null
$script:startedAt = Get-Date
$script:targetStartedAt = Get-Date
$script:finished = $false
$script:allowClose = $false

function Add-LogLine {
    param([string] $Line)
    $detailBox.AppendText($Line + [Environment]::NewLine)
}

function Complete-CurrentTarget {
    param(
        [bool] $Success,
        [string] $Reason = ''
    )

    $script:completed++
    $overallBar.Value = [Math]::Min($script:completed, $overallBar.Maximum)

    if ($Success) {
        $script:succeeded++
        Add-LogLine "[成功] $($script:currentTarget)"
    }
    else {
        $script:failed++
        Add-LogLine "[失败] $($script:currentTarget) — $Reason"
    }

    $script:currentTarget = $null
}

function Finish-Deletion {
    $script:finished = $true
    $timer.Stop()

    $elapsed = [Math]::Round(((Get-Date) - $script:startedAt).TotalSeconds, 1)
    $titleLabel.Text = if ($script:failed -eq 0) { '删除完成' } else { '删除完成，但有失败项目' }
    $pathLabel.Text = ''
    $statusLabel.Text = "成功 $($script:succeeded) 项，失败 $($script:failed) 项；总耗时 $elapsed 秒"
    $activityBar.Style = [System.Windows.Forms.ProgressBarStyle]::Blocks
    $activityBar.MarqueeAnimationSpeed = 0
    $activityBar.Minimum = 0
    $activityBar.Maximum = 1
    $activityBar.Value = 1
    $closeButton.Enabled = $true
    $form.AcceptButton = $closeButton
    $script:allowClose = $true
    $form.TopMost = $false
}

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 200
$timer.Add_Tick({
    try {
        if ($null -ne $script:deleteJob) {
            if (-not $script:deleteJob.Task.IsCompleted) {
                $seconds = [Math]::Floor(((Get-Date) - $script:targetStartedAt).TotalSeconds)
                $deletedFiles = $script:deleteJob.DeletedFiles
                $deletedDirectories = $script:deleteJob.DeletedDirectories
                $statusLabel.Text = "已删文件 $deletedFiles，目录 $deletedDirectories · 已用时 $seconds 秒 · 目标 $($script:completed + 1)/$($targets.Count)"
                if (-not [string]::IsNullOrWhiteSpace($script:deleteJob.CurrentPath)) {
                    $pathLabel.Text = $script:deleteJob.CurrentPath
                }
                return
            }

            $script:deleteJob.Task.Dispose()
            $deleteError = $script:deleteJob.ErrorMessage
            $deleteErrorCount = $script:deleteJob.ErrorCount
            $script:deleteJob = $null

            if ([System.IO.Directory]::Exists($script:currentTarget) -or
                [System.IO.File]::Exists($script:currentTarget)) {
                if ([string]::IsNullOrWhiteSpace($deleteError)) {
                    $deleteError = '目标仍然存在，可能被占用或权限不足'
                }
                if ($deleteErrorCount -gt 20) {
                    $deleteError += "`r`n……另有 $($deleteErrorCount - 20) 个错误"
                }
                Complete-CurrentTarget -Success $false -Reason $deleteError
            }
            else {
                Complete-CurrentTarget -Success $true
            }
            return
        }

        if ($script:index -ge $targets.Count) {
            Finish-Deletion
            return
        }

        $script:currentTarget = $targets[$script:index]
        $script:index++
        $script:targetStartedAt = Get-Date
        $pathLabel.Text = $script:currentTarget
        $statusLabel.Text = "准备删除 · 完成 $($script:completed)/$($targets.Count)"

        if (-not [System.IO.Directory]::Exists($script:currentTarget) -and
            -not [System.IO.File]::Exists($script:currentTarget)) {
            Complete-CurrentTarget -Success $true -Reason '目标已不存在'
            return
        }

        $script:deleteJob = [FastDeleteJob]::Start($script:currentTarget)
    }
    catch {
        if ($null -ne $script:currentTarget) {
            Complete-CurrentTarget -Success $false -Reason $_.Exception.Message
        }
        else {
            Add-LogLine "[错误] $($_.Exception.Message)"
            $script:failed++
        }
    }
})

$form.Add_FormClosing({
    param($sender, $eventArgs)
    if (-not $script:allowClose) {
        $eventArgs.Cancel = $true
        [void] (Show-Dialog -Text '删除仍在进行中。为避免留下半删除目录，请等待任务结束。' -Icon Warning)
    }
})

$form.Add_Shown({
    Add-LogLine '删除引擎：Win32 并行快速删除（先扫描后并行删除）；目录联接点只删除链接本身。'
    if ($selection.Rejected.Count -gt 0) {
        foreach ($message in $selection.Rejected) {
            Add-LogLine "[跳过] $message"
        }
    }
    $timer.Start()
})

[System.Windows.Forms.Application]::Run($form)
