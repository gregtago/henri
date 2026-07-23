@echo off
chcp 65001 >nul
setlocal

REM =====================================================================
REM  A REGLER UNE SEULE FOIS : le fichier a copier dans chaque dossier
REM  (mettez le vrai chemin de votre modele entre les guillemets)
set "FICHIER=%OneDrive%\Dossiers\_Modele\modele.docx"

REM  Ou seront crees les dossiers (par defaut : OneDrive\Dossiers)
set "BASE=%OneDrive%\Dossiers"
REM =====================================================================

set /p "NOM=Nom du dossier : "
if "%NOM%"=="" ( echo Aucun nom saisi. & pause & exit /b 1 )

set "RACINE=%BASE%\%NOM%"

md "%RACINE%\Dossier d'usage %NOM%"
md "%RACINE%\Après-vente %NOM%"

if exist "%FICHIER%" (
    copy "%FICHIER%" "%RACINE%\" >nul
) else (
    echo.
    echo  ATTENTION : fichier a copier introuvable :
    echo    %FICHIER%
    echo  Les dossiers ont ete crees, mais aucun fichier n'a ete copie.
    echo  Corrigez la ligne "set FICHIER=..." en haut de ce script.
)

echo.
echo  Dossier cree : %RACINE%
echo.
pause
