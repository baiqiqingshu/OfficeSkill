param(
    [Parameter(Mandatory = $true)][string]$InputPptx,
    [Parameter(Mandatory = $true)][string]$OutputDirectory
)
$ErrorActionPreference = 'Stop'
$taskPptPath = (Resolve-Path -LiteralPath $InputPptx).Path
$taskExportPath = [System.IO.Path]::GetFullPath($OutputDirectory)
if ($taskPptPath.StartsWith('\\') -or $taskExportPath.StartsWith('\\')) {
    throw 'Only local files and output folders are supported.'
}
if ([System.IO.Path]::GetExtension($taskPptPath) -ne '.pptx') {
    throw 'Input must be a .pptx file.'
}
if (Test-Path -LiteralPath $taskExportPath) {
    throw 'Choose a new output folder; existing exports are never deleted.'
}
New-Item -ItemType Directory -Path $taskExportPath | Out-Null
$taskPowerPoint = $null
$taskDeck = $null
try {
    # COM can connect to a user's existing PowerPoint instance. Do not quit it.
    $taskPowerPoint = New-Object -ComObject PowerPoint.Application
    $taskDeck = $taskPowerPoint.Presentations.Open($taskPptPath, $true, $false, $false)
    $taskDeck.Export($taskExportPath, 'PNG', 1600, 900)
    Write-Output "Exported $($taskDeck.Slides.Count) slides to $taskExportPath"
} finally {
    if ($null -ne $taskDeck) {
        $taskDeck.Close()
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($taskDeck) | Out-Null
    }
    if ($null -ne $taskPowerPoint) {
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($taskPowerPoint) | Out-Null
    }
}
