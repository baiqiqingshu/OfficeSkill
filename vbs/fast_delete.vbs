Option Explicit

' Explorer++ entry point for fast permanent deletion.
' With no arguments, the current Explorer++ selection is copied to the clipboard
' and read by fast_delete_worker.ps1. Explicit path arguments are also supported.

Dim shell, fso, scriptDir, workerPath, powershellPath, command, selectionFile
Dim index, stream

If WScript.Arguments.Count = 1 Then
    If LCase(WScript.Arguments(0)) = "--self-test" Then WScript.Quit 0
End If

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
workerPath = fso.BuildPath(scriptDir, "fast_delete_worker.ps1")
powershellPath = shell.ExpandEnvironmentStrings( _
    "%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe")

If Not fso.FileExists(workerPath) Then
    MsgBox "Missing deletion worker:" & vbCrLf & workerPath, _
        vbCritical + vbOKOnly, "Fast Delete"
    WScript.Quit 2
End If

command = Quote(powershellPath) & _
    " -NoLogo -NoProfile -STA -ExecutionPolicy Bypass -WindowStyle Hidden -File " & _
    Quote(workerPath)

If WScript.Arguments.Count > 0 Then
    Randomize
    selectionFile = fso.BuildPath(shell.ExpandEnvironmentStrings("%TEMP%"), _
        "fast_delete_" & Replace(CStr(Timer), ".", "_") & "_" & _
        CStr(Int(Rnd * 1000000)) & ".paths")

    Set stream = fso.CreateTextFile(selectionFile, True, True)
    For index = 0 To WScript.Arguments.Count - 1
        stream.WriteLine WScript.Arguments(index)
    Next
    stream.Close

    command = command & " -SelectionFile " & Quote(selectionFile)
Else
    ' The single worker process clears the clipboard and captures the current
    ' Explorer++ selection. Avoiding a separate PowerShell startup keeps the
    ' confirmation dialog responsive.
    command = command & " -FromClipboard"
End If

' The worker owns confirmation, progress reporting and error display.
shell.Run command, 0, False

Function Quote(ByVal value)
    Quote = Chr(34) & Replace(value, Chr(34), Chr(34) & Chr(34)) & Chr(34)
End Function
