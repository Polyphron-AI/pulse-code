$ErrorActionPreference = 'Stop'
& "$PSScriptRoot/.venv/Scripts/python.exe" -u "$PSScriptRoot/benchmark.py" @args
exit $LASTEXITCODE
