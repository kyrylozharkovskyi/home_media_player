' Launcher — Домашній кінотеатр
' Usuwa ELECTRON_RUN_AS_NODE, zabija stare instancje, uruchamia bez okna CMD

Dim oShell, oEnv, sDir, sExe, sCmd

Set oShell = CreateObject("WScript.Shell")

' Katalog skryptu (bez końcowego backslash)
sDir = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\") - 1)

' Zabij poprzednie instancje (ignoruje błąd jeśli nie ma żadnej)
oShell.Run "taskkill /F /IM electron.exe", 0, True
WScript.Sleep 600

' Usuń zmienne które psują Electron
Set oEnv = oShell.Environment("Process")
oEnv.Remove "ELECTRON_RUN_AS_NODE"
oEnv.Remove "NODE_ENV"
oEnv.Remove "NODE_PATH"

sExe = sDir & "\node_modules\electron\dist\electron.exe"
sCmd = Chr(34) & sExe & Chr(34) & " " & Chr(34) & sDir & Chr(34)

' 0 = ukryte okno, False = nie czekaj
oShell.Run sCmd, 0, False

Set oEnv = Nothing
Set oShell = Nothing
