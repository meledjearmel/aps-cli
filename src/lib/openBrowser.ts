import open from 'open';

/**
 * Ouvre l'URL dans le navigateur par defaut. Delegue a `open` plutot que
 * d'invoquer `cmd /c start` nous-memes : sur Windows, `cmd.exe` reparse la
 * ligne de commande assemblee et traite `&`, `|`, `^` comme des separateurs
 * de commande meme quand spawn() recoit un tableau d'arguments distincts —
 * une URL contenant plusieurs parametres (ou une reponse serveur
 * compromise) pourrait alors executer une commande arbitraire.
 */
export async function openBrowser(url: string): Promise<void> {
  try {
    await open(url);
  } catch {
    // best-effort : l'URL reste affichee dans le terminal pour ouverture manuelle.
  }
}
