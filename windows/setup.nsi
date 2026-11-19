; setup.nsi - the ZeroTyperance setup program (per user, no administrator rights).
; Built by tools/release_ts/make_windows.py, which defines VERSION, STAGE (the staged folder), OUTFILE, SIZE_KB, ICON and
; writes the two file lists it includes. -DZT_TEST builds the variant the tests use: another product key, shortcut
; names and a game port of its own, so it never touches an installed copy.
Unicode true
SetCompressor /SOLID lzma
RequestExecutionLevel user
ManifestDPIAware true

!include "MUI2.nsh"
!include "LogicLib.nsh"

!ifdef ZT_TEST
  !define PRODKEY "ZeroTyperanceTest"
  !define LNKNAME "ZeroTyperance (test)"
  !define QUITARGS "--quit --port 8817"
!else
  !define PRODKEY "ZeroTyperance"
  !define LNKNAME "ZeroTyperance"
  !define QUITARGS "--quit"
!endif
!define UNKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODKEY}"

Name "ZeroTyperance ${VERSION}"
OutFile "${OUTFILE}"
InstallDir "$LOCALAPPDATA\Programs\ZeroTyperance"
BrandingText "ZeroTyperance ${VERSION}"
ShowInstDetails show
ShowUninstDetails show

VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "ZeroTyperance"
VIAddVersionKey "FileDescription" "ZeroTyperance setup"
VIAddVersionKey "LegalCopyright" "ZeroTyperance"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"

!define MUI_ICON "${ICON}"
!define MUI_UNICON "${ICON}"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\ZeroTyperance.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Run ZeroTyperance"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "${STAGE}\LICENSE"
!define MUI_PAGE_CUSTOMFUNCTION_LEAVE DirLeave
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

; the directory page: a folder that is not empty and holds no ZeroTyperance gets a warning (the files would mix with
; the user's; the uninstaller removes only its own files)
Function DirLeave
  IfFileExists "$INSTDIR\launch.mjs" dir_ok
  FindFirst $0 $1 "$INSTDIR\*.*"
  dir_loop:
    StrCmp $1 "" dir_empty
    StrCmp $1 "." dir_next
    StrCmp $1 ".." dir_next
    FindClose $0
    MessageBox MB_YESNO|MB_ICONEXCLAMATION "$INSTDIR is not empty and does not hold ZeroTyperance.$\r$\n$\r$\nInstall into it anyway? Choose No to pick an empty folder (the default is $LOCALAPPDATA\Programs\ZeroTyperance)." IDYES dir_ok
    Abort
  dir_next:
    FindNext $0 $1
    Goto dir_loop
  dir_empty:
  FindClose $0
  dir_ok:
FunctionEnd

Section "ZeroTyperance" SecMain
  SectionIn RO
  SetShellVarContext current
  ; an earlier copy that is still running: ask it to stop (returns when it has)
  IfFileExists "$INSTDIR\ZeroTyperance.exe" 0 +3
    DetailPrint "Stopping the running ZeroTyperance"
    ExecWait '"$INSTDIR\ZeroTyperance.exe" ${QUITARGS}'
  ; the program folders of an older version (stale files), only in a folder that already holds ZeroTyperance (a folder
  ; the user picked may have an unrelated app\ or node\); rom\ stays
  IfFileExists "$INSTDIR\launch.mjs" 0 +4
    RMDir /r "$INSTDIR\app"
    RMDir /r "$INSTDIR\server"
    RMDir /r "$INSTDIR\node"
  !include "${LISTDIR}\install_files.nsh"

  DetailPrint "Looking for the Zero Tolerance ROM image"
  nsExec::ExecToLog '"$INSTDIR\node\node.exe" "$INSTDIR\fetch_rom.mjs"'
  Pop $0
  ${If} $0 == "3"
    DetailPrint "No ROM image could be downloaded: the page will ask you for one"
  ${ElseIf} $0 != "0"
    DetailPrint "The ROM image step ended with $0: the page will ask you for one"
  ${EndIf}

  SetOutPath "$INSTDIR"
  CreateShortcut "$SMPROGRAMS\${LNKNAME}.lnk" "$INSTDIR\ZeroTyperance.exe" "" "$INSTDIR\ZeroTyperance.exe" 0
  WriteUninstaller "$INSTDIR\uninstall.exe"
  WriteRegStr HKCU "${UNKEY}" "DisplayName" "ZeroTyperance"
  WriteRegStr HKCU "${UNKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNKEY}" "DisplayIcon" "$INSTDIR\ZeroTyperance.exe"
  WriteRegStr HKCU "${UNKEY}" "Publisher" "ZeroTyperance"
  WriteRegStr HKCU "${UNKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNKEY}" "UninstallString" '"$INSTDIR\uninstall.exe"'
  WriteRegStr HKCU "${UNKEY}" "QuietUninstallString" '"$INSTDIR\uninstall.exe" /S'
  WriteRegStr HKCU "${UNKEY}" "URLInfoAbout" "https://github.com/DarthNuts/ZeroTyperance"
  WriteRegDWORD HKCU "${UNKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNKEY}" "NoRepair" 1
  WriteRegDWORD HKCU "${UNKEY}" "EstimatedSize" ${SIZE_KB}
SectionEnd

Section /o "Desktop shortcut" SecDesktop
  SetShellVarContext current
  SetOutPath "$INSTDIR"
  CreateShortcut "$DESKTOP\${LNKNAME}.lnk" "$INSTDIR\ZeroTyperance.exe" "" "$INSTDIR\ZeroTyperance.exe" 0
SectionEnd

LangString DESC_Main ${LANG_ENGLISH} "The game, its local server and the ROM image download."
LangString DESC_Desktop ${LANG_ENGLISH} "A ZeroTyperance shortcut on the desktop."
!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
  !insertmacro MUI_DESCRIPTION_TEXT ${SecMain} $(DESC_Main)
  !insertmacro MUI_DESCRIPTION_TEXT ${SecDesktop} $(DESC_Desktop)
!insertmacro MUI_FUNCTION_DESCRIPTION_END

Section "Uninstall"
  SetShellVarContext current
  IfFileExists "$INSTDIR\ZeroTyperance.exe" 0 +3
    DetailPrint "Stopping the running ZeroTyperance"
    ExecWait '"$INSTDIR\ZeroTyperance.exe" ${QUITARGS}'
  !include "${LISTDIR}\uninstall_files.nsh"
  Delete "$INSTDIR\uninstall.exe"
  Delete "$SMPROGRAMS\${LNKNAME}.lnk"
  Delete "$DESKTOP\${LNKNAME}.lnk"
  DeleteRegKey HKCU "${UNKEY}"
  ; no /r: a folder the user filled stays
  RMDir "$INSTDIR"
  DetailPrint "The game's extracted assets stay in the browser until its site data for http://localhost:8802 is cleared."
SectionEnd
