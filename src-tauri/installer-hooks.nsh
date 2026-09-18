!macro NSIS_HOOK_POSTINSTALL
  ; Preserve an existing opt-in while updating its executable location.
  ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "DesktopPet.${BUNDLEID}"
  ${If} $R0 != ""
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "DesktopPet.${BUNDLEID}" '$\"$INSTDIR\${MAINBINARYNAME}.exe$\" --autostart'
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; Updates preserve opt-in; uninstall removes only this installation's entry.
  ${If} $UpdateMode <> 1
    ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "DesktopPet.${BUNDLEID}"
    ${If} $R0 == '$\"$INSTDIR\${MAINBINARYNAME}.exe$\" --autostart'
      DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "DesktopPet.${BUNDLEID}"
    ${EndIf}
  ${EndIf}
!macroend
