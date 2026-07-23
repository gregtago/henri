<#
    Creer-dossier-vente.ps1
    ------------------------
    Cree l'arborescence type d'un dossier de vente (Espace partage / Espace prive)
    dans le repertoire Dossiers de OneDrive.

    USAGE (dans PowerShell) :
        .\Creer-dossier-vente.ps1 -Nom "2026 - DUPONT a MARTIN - Vente"

    Ou en laissant le script demander le nom :
        .\Creer-dossier-vente.ps1

    Par defaut, le dossier est cree sous :
        %OneDrive%\Dossiers\
    On peut viser un autre emplacement avec -Base :
        .\Creer-dossier-vente.ps1 -Nom "..." -Base "D:\Autre\Chemin"

    Si l'execution de scripts est bloquee, lancer une fois :
        Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
#>

param(
    [string]$Nom,
    [string]$Base
)

# Emplacement par defaut : OneDrive\Dossiers
if ([string]::IsNullOrWhiteSpace($Base)) {
    $oneDrive = $env:OneDrive
    if ([string]::IsNullOrWhiteSpace($oneDrive)) { $oneDrive = $env:OneDriveCommercial }
    if ([string]::IsNullOrWhiteSpace($oneDrive)) { $oneDrive = [Environment]::GetFolderPath('UserProfile') }
    $Base = Join-Path $oneDrive 'Dossiers'
}

# Nom du dossier
if ([string]::IsNullOrWhiteSpace($Nom)) {
    $annee = (Get-Date).Year
    $Nom = Read-Host "Nom du dossier (ex. '$annee - DUPONT a MARTIN - Vente')"
}
if ([string]::IsNullOrWhiteSpace($Nom)) {
    Write-Error "Aucun nom fourni. Abandon."
    exit 1
}

# Arborescence relative (chemins Espace / sous-dossiers)
$arbo = @(
    '01 - ESPACE PARTAGE\01 - Pieces des parties\Vendeur',
    '01 - ESPACE PARTAGE\01 - Pieces des parties\Acquereur',
    '01 - ESPACE PARTAGE\02 - Titre de propriete et origine',
    '01 - ESPACE PARTAGE\03 - Diagnostics techniques (DDT)',
    '01 - ESPACE PARTAGE\04 - Urbanisme',
    '01 - ESPACE PARTAGE\05 - Copropriete',
    '01 - ESPACE PARTAGE\06 - Avant-contrat (compromis)',
    '01 - ESPACE PARTAGE\07 - Financement acquereur',
    '01 - ESPACE PARTAGE\08 - Acte de vente',
    '01 - ESPACE PARTAGE\09 - Correspondance avec les clients',
    '02 - ESPACE PRIVE\01 - Suivi et notes internes',
    '02 - ESPACE PRIVE\02 - Requisitions et demandes\Etat civil',
    '02 - ESPACE PRIVE\02 - Requisitions et demandes\Cadastre et geometre',
    '02 - ESPACE PRIVE\02 - Requisitions et demandes\Publicite fonciere (hypotheques)',
    '02 - ESPACE PRIVE\02 - Requisitions et demandes\Syndic',
    '02 - ESPACE PRIVE\02 - Requisitions et demandes\Mairie et DIA (preemption)',
    '02 - ESPACE PRIVE\03 - Fiscalite et calculs',
    '02 - ESPACE PRIVE\04 - Comptabilite',
    '02 - ESPACE PRIVE\05 - Correspondance interne',
    '02 - ESPACE PRIVE\06 - Formalites posterieures',
    '02 - ESPACE PRIVE\07 - Brouillons de travail'
)

$racine = Join-Path $Base $Nom

if (Test-Path $racine) {
    Write-Warning "Le dossier existe deja : $racine"
    Write-Warning "Les sous-dossiers manquants seront completes, rien ne sera efface."
}

New-Item -ItemType Directory -Path $racine -Force | Out-Null
foreach ($rel in $arbo) {
    $chemin = Join-Path $racine $rel
    New-Item -ItemType Directory -Path $chemin -Force | Out-Null
}

Write-Host ""
Write-Host "Dossier de vente cree :" -ForegroundColor Green
Write-Host "  $racine"
Write-Host "$($arbo.Count + 1) dossiers crees / verifies."
