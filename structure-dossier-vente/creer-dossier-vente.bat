@echo off
chcp 1252 >nul
setlocal

REM =====================================================================
REM  Fichier modele a dupliquer dans chaque dossier cree
set "FICHIER=%OneDrive%\Dossiers\_$ventes\_modele.xlsx"

REM  Ou seront crees les dossiers (par defaut : OneDrive\Dossiers)
set "BASE=%OneDrive%\Dossiers"
REM =====================================================================

set /p "NOM=Nom du dossier : "
if "%NOM%"=="" goto :vide

set "RACINE=%BASE%\%NOM%"

md "%RACINE%\Dossier d'usage %NOM%"
md "%RACINE%\Après-vente %NOM%"

if exist "%FICHIER%" (
    copy "%FICHIER%" "%RACINE%\$%NOM%.xlsx" >nul
    echo.
    echo  Dossier cree : %RACINE%
) else (
    echo.
    echo  ATTENTION : fichier modele introuvable :
    echo    %FICHIER%
    echo  Les dossiers ont ete crees, mais aucun fichier n'a ete copie.
    echo  Verifiez la ligne "set FICHIER=..." en haut de ce script.
)

echo.
pause
exit /b 0

:vide
echo Aucun nom saisi.
pause
exit /b 1
