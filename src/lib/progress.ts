import type { Status } from "./types";

export const getProgressLevel = (status: Status) => {
  switch (status) {
    case "À faire":
      return 0;
    case "Demandé":
      return 1;
    case "Reçu":
      return 2;
    case "Traité":
      return 3;
    case "En attente":
    case "Bloqué":
    default:
      return 1;
  }
};
