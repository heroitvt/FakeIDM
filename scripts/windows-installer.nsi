Unicode true
!include "MUI2.nsh"
Name "FakeIDM"
OutFile "${OUTPUT}"
InstallDir "$LOCALAPPDATA\Programs\FakeIDM"
InstallDirRegKey HKCU "Software\FakeIDM" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma
VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "FakeIDM"
VIAddVersionKey "FileDescription" "FakeIDM Setup"
VIAddVersionKey "FileVersion" "${VERSION}"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"
Section "Install"
  SetShellVarContext current
  SetOutPath "$INSTDIR"
  File /r "${SOURCE}\*"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateShortcut "$SMPROGRAMS\FakeIDM.lnk" "$INSTDIR\FakeIDM.exe"
  CreateShortcut "$DESKTOP\FakeIDM.lnk" "$INSTDIR\FakeIDM.exe"
  WriteRegStr HKCU "Software\FakeIDM" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\FakeIDM" "DisplayName" "FakeIDM"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\FakeIDM" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\FakeIDM" "UninstallString" '$"$INSTDIR\Uninstall.exe$"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\FakeIDM" "DisplayIcon" "$INSTDIR\FakeIDM.exe"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\FakeIDM" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\FakeIDM" "NoRepair" 1
SectionEnd
Section "Uninstall"
  SetShellVarContext current
  Delete "$SMPROGRAMS\FakeIDM.lnk"
  Delete "$DESKTOP\FakeIDM.lnk"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\FakeIDM"
  DeleteRegKey HKCU "Software\FakeIDM"
SectionEnd
