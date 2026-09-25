// Code review automático: procura os textos proibidos de regras-review.txt
// ignorando trechos comentados (//, &&, * no início da linha e /* */).
// Textos dentro de strings continuam sendo verificados, mas "//" dentro
// de string não vira comentário.
const fs = require("fs");
const { execFileSync } = require("child_process");

const REGRAS = "regras-review.txt";

// Troca comentários por espaços, mantendo as quebras de linha
// para que o número da linha reportado continue correto.
function removerComentarios(fonte) {
  let saida = "";
  let estado = null; // null, '"', "'", "//" ou "/*"
  let inicioLinha = true; // só espaços desde a última quebra de linha
  for (let i = 0; i < fonte.length; i++) {
    const c = fonte[i];
    const prox = fonte[i + 1];
    if (estado === null) {
      if (c === "/" && prox === "/") { estado = "//"; i++; continue; }
      if (c === "&" && prox === "&") { estado = "//"; i++; continue; }
      if (c === "*" && inicioLinha) { estado = "//"; continue; }
      if (c === "/" && prox === "*") { estado = "/*"; saida += "  "; i++; continue; }
      if (c === '"' || c === "'") estado = c;
      if (c === "\n") inicioLinha = true;
      else if (c !== " " && c !== "\t" && c !== "\r") inicioLinha = false;
      saida += c;
    } else if (estado === "//") {
      if (c === "\n") { estado = null; inicioLinha = true; saida += c; }
    } else if (estado === "/*") {
      if (c === "*" && prox === "/") { estado = null; inicioLinha = false; saida += "  "; i++; continue; }
      saida += c === "\n" ? "\n" : " ";
    } else {
      // dentro de string
      if (c === estado || c === "\n") estado = null;
      if (c === "\n") inicioLinha = true;
      saida += c;
    }
  }
  return saida;
}

const regras = fs.readFileSync(REGRAS, "latin1")
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"));

const arquivos = execFileSync("git", [
  "ls-files", "--", ".", `:(exclude)${REGRAS}`, ":(exclude).github",
], { encoding: "utf8" }).split("\n").filter(Boolean);

const achados = new Map(regras.map((r) => [r, []]));
for (const arq of arquivos) {
  let conteudo;
  try {
    conteudo = removerComentarios(fs.readFileSync(arq, "latin1"));
  } catch {
    continue;
  }
  conteudo.split(/\r?\n/).forEach((linha, idx) => {
    const minuscula = linha.toLowerCase();
    for (const regra of regras) {
      if (minuscula.includes(regra.toLowerCase())) {
        achados.get(regra).push(`${arq}:${idx + 1}:${linha.trim()}`);
      }
    }
  });
}

let erro = false;
for (const [regra, lista] of achados) {
  if (lista.length) {
    erro = true;
    console.log(`::error::Proibido: ${regra}`);
    console.log(lista.join("\n"));
  }
}

if (erro) process.exit(1);
console.log("✅ Code-review OK!");
