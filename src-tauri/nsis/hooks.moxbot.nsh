; MoXBots NSIS hooks. Keep process and runtime cleanup scoped to the current
; MoXBots install and its .moxbot SDK/MCP children; never target MyAgents.

!macro _MOXBOTS_REMOVE_NODE_RUNTIME
  IfFileExists "$INSTDIR\nodejs" 0 moxbots_node_runtime_removed
  DetailPrint "Removing the previous bundled Node.js runtime..."
  ClearErrors
  RMDir /r "$INSTDIR\nodejs"
  IfErrors 0 moxbots_node_runtime_removed
    SetErrorLevel 2
    Abort "Unable to remove the bundled Node.js runtime. Close processes using this MoXBots installation and run the installer again."
  moxbots_node_runtime_removed:
!macroend

!macro _MOXBOTS_KILL_PROCESSES
  DetailPrint "Cleaning up MoXBots background processes..."

  ; Only terminate executables physically under this MoXBots installation.
  nsExec::ExecToLog 'powershell -NoProfile -Command "$ErrorActionPreference=\"SilentlyContinue\"; Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -like \"$INSTDIR\*\" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"'

  ; SDK/MCP child processes may use system Node, so scope those by .moxbot paths.
  nsExec::ExecToLog 'powershell -NoProfile -Command "$ErrorActionPreference=\"SilentlyContinue\"; Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like \"*claude-agent-sdk*\" -and $_.CommandLine -like \"*.moxbot*\" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"'
  nsExec::ExecToLog 'powershell -NoProfile -Command "$ErrorActionPreference=\"SilentlyContinue\"; Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like \"*.moxbot\mcp\*\" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"'

  Sleep 1500
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro _MOXBOTS_KILL_PROCESSES
  !insertmacro _MOXBOTS_REMOVE_NODE_RUNTIME
  Delete "$INSTDIR\bun.exe"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro _MOXBOTS_KILL_PROCESSES
  !insertmacro _MOXBOTS_REMOVE_NODE_RUNTIME
  Delete "$INSTDIR\bun.exe"
!macroend
