@echo off
setlocal enabledelayedexpansion
REM ============================================================
REM  creer-dossier-vente.bat
REM  Cree l'arborescence type d'un dossier de vente
REM  (Espace partage / Espace prive) dans OneDrive\Dossiers.
REM
REM  Usage : double-clic, puis saisir le nom du dossier.
REM  Ou en ligne de commande :
REM     creer-dossier-vente.bat "2026 - DUPONT a MARTIN - Vente"
REM ============================================================

REM --- Emplacement de base : OneDrive\Dossiers ---
set "BASE=%OneDrive%\Dossiers"
if not exist "%OneDrive%" set "BASE=%OneDriveCommercial%\Dossiers"
if not defined OneDrive if not defined OneDriveCommercial set "BASE=%USERPROFILE%\Dossiers"

REM --- Nom du dossier ---
set "NOM=%~1"
if "%NOM%"=="" set /p "NOM=Nom du dossier (ex. 2026 - DUPONT a MARTIN - Vente) : "
if "%NOM%"=="" (
    echo Aucun nom fourni. Abandon.
    pause
    exit /b 1
)

set "RACINE=%BASE%\%NOM%"

REM --- Espace partage ---
md "%RACINE%\01 - ESPACE PARTAGE\01 - Pieces des parties\Vendeur"        2>nul
md "%RACINE%\01 - ESPACE PARTAGE\01 - Pieces des parties\Acquereur"      2>nul
md "%RACINE%\01 - ESPACE PARTAGE\02 - Titre de propriete et origine"     2>nul
md "%RACINE%\01 - ESPACE PARTAGE\03 - Diagnostics techniques (DDT)"      2>nul
md "%RACINE%\01 - ESPACE PARTAGE\04 - Urbanisme"                         2>nul
md "%RACINE%\01 - ESPACE PARTAGE\05 - Copropriete"                       2>nul
md "%RACINE%\01 - ESPACE PARTAGE\06 - Avant-contrat (compromis)"         2>nul
md "%RACINE%\01 - ESPACE PARTAGE\07 - Financement acquereur"             2>nul
md "%RACINE%\01 - ESPACE PARTAGE\08 - Acte de vente"                     2>nul
md "%RACINE%\01 - ESPACE PARTAGE\09 - Correspondance avec les clients"   2>nul

REM --- Espace prive ---
md "%RACINE%\02 - ESPACE PRIVE\01 - Suivi et notes internes"                             2>nul
md "%RACINE%\02 - ESPACE PRIVE\02 - Requisitions et demandes\Etat civil"                 2>nul
md "%RACINE%\02 - ESPACE PRIVE\02 - Requisitions et demandes\Cadastre et geometre"       2>nul
md "%RACINE%\02 - ESPACE PRIVE\02 - Requisitions et demandes\Publicite fonciere (hypotheques)" 2>nul
md "%RACINE%\02 - ESPACE PRIVE\02 - Requisitions et demandes\Syndic"                     2>nul
md "%RACINE%\02 - ESPACE PRIVE\02 - Requisitions et demandes\Mairie et DIA (preemption)" 2>nul
md "%RACINE%\02 - ESPACE PRIVE\03 - Fiscalite et calculs"        2>nul
md "%RACINE%\02 - ESPACE PRIVE\04 - Comptabilite"                2>nul
md "%RACINE%\02 - ESPACE PRIVE\05 - Correspondance interne"      2>nul
md "%RACINE%\02 - ESPACE PRIVE\06 - Formalites posterieures"     2>nul
md "%RACINE%\02 - ESPACE PRIVE\07 - Brouillons de travail"       2>nul

echo.
echo Dossier de vente cree :
echo   %RACINE%
echo.
pause
