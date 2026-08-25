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

// Ввод пароля со звёздочками вместо символов (полностью скрыть ввод
// переносимо между терминалами сложнее, звёздочки — разумный компромисс).
export function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    let value = "";
    const onData = (chunk) => {
      for (const ch of chunk.toString("utf8")) {
        if (ch === CTRL_C) {
          process.stdout.write("\n");
          process.exit(130);
        } else if (ch === DEL || ch === BACKSPACE) {
          value = value.slice(0, -1);
        } else if (ch === "\r" || ch === "\n") {
          continue;
        } else {
          value += ch;
        }
      }
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);
      process.stdout.write(question + "*".repeat(value.length));
    };
    process.stdin.on("data", onData);
    rl.question(question, () => {
      process.stdin.removeListener("data", onData);
      rl.close();
      process.stdout.write("\n");
      resolve(value);
    });
  });
}
