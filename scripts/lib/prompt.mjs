import readline from "node:readline";

export function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

const CTRL_C = String.fromCharCode(3);
const DEL = String.fromCharCode(127);
const BACKSPACE = String.fromCharCode(8);

// Ввод пароля со звёздочками вместо символов. Управляем raw-режимом stdin
// напрямую, БЕЗ readline.Interface — смешивание readline (у которого своя
// внутренняя буферизация строки) с ручным посимвольным чтением приводило к
// потере символов и к тому, что недочитанные нажатия клавиш утекали прямо в
// shell после завершения процесса.
export function askHidden(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw ?? false;
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    let value = "";

    const cleanup = () => {
      stdin.removeListener("data", onData);
      if (stdin.isTTY) stdin.setRawMode(wasRaw);
      stdin.pause();
    };

    const onData = (chunk) => {
      const str = chunk.toString("utf8");
      for (let i = 0; i < str.length; i++) {
        const ch = str[i];
        if (ch === CTRL_C) {
          cleanup();
          process.stdout.write("\n");
          process.exit(130);
        } else if (ch === "\r" || ch === "\n") {
          // Если вставили пароль целиком (например, из менеджера паролей),
          // после переноса строки в этом же куске может остаться "хвост" —
          // возвращаем его обратно в поток, чтобы не потерять и не дать
          // утечь мимо следующего запроса.
          const leftover = str.slice(i + 1);
          cleanup();
          if (leftover) stdin.unshift(leftover);
          process.stdout.write("\n");
          resolve(value);
          return;
        } else if (ch === DEL || ch === BACKSPACE) {
          if (value.length > 0) {
            value = value.slice(0, -1);
            process.stdout.write("\b \b");
          }
        } else {
          value += ch;
          process.stdout.write("*");
        }
      }
    };

    stdin.on("data", onData);
  });
}
