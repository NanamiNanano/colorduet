# Create a desktop shortcut for the launcher (no Chinese literals inside, so encoding never matters).
$ErrorActionPreference = 'Stop'

$exe = Get-ChildItem -LiteralPath $PSScriptRoot -Filter '*.exe' |
       Where-Object { $_.Name -notlike 'python*' } | Select-Object -First 1
if (-not $exe) {
    Write-Host 'No launcher exe found next to this script.'
    exit 1
}

$desktop = [Environment]::GetFolderPath('Desktop')
$lnkPath = Join-Path $desktop ($exe.BaseName + '.lnk')

$shell = New-Object -ComObject WScript.Shell
$sc = $shell.CreateShortcut($lnkPath)
$sc.TargetPath = $exe.FullName
$sc.WorkingDirectory = $PSScriptRoot
$sc.IconLocation = $exe.FullName + ',0'
$sc.Description = $exe.BaseName
$sc.Save()

Write-Host ('Shortcut created: ' + $lnkPath)
Start-Sleep -Seconds 2
