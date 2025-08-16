process.title = "147Company™ | Checker de usernames.";

const https = require("https");
const fs = require("fs");
const { exec, spawn, spawnSync, execSync } = require("child_process");
const { SocksProxyAgent } = require("socks-proxy-agent");
const os = require("os");
const path = require("path");
const net = require("net");
const readline = require("readline");
const fsp = fs.promises;

const DOWNLOAD_URL =
	"https://archive.torproject.org/tor-package-archive/torbrowser/14.5.4/";
const agent = new SocksProxyAgent("socks5h://127.0.0.1:9050");

const roxo = process.stdout.isTTY ? "\x1b[38;2;160;32;240m" : "";
const roxo_2 = process.stdout.isTTY ? "\x1b[38;2;138;43;226m" : "";
const reset = process.stdout.isTTY ? "\x1b[0m" : "";
const vermelho = process.stdout.isTTY ? "\x1b[31m" : "";

const verde = process.stdout.isTTY ? "\x1b[32m" : "";
const erro = process.stdout.isTTY ? `[ ${vermelho}×${reset} ]` : "[ × ]";
const amarelo = process.stdout.isTTY ? "\x1b[33m" : "";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const config = () => {
	if (!fs.existsSync("./config.json")) {
		criarConfig();
	}
	return JSON.parse(fs.readFileSync("./config.json", "utf8"));
};

function criarConfig() {
	const configData = {
		delay_requests: "3000",
		delay_troca_ips: "25",
		salvar_validos: true,
		enviar_validos: false,
	};

	fs.writeFileSync("config.json", JSON.stringify(configData, null, 4));
}

const arte = `${roxo}
   __  __    __  ________ 
 _/  |/  |  /  |/        |
/ $$ |$$ |  $$ |$$$$$$$$/ 
$$$$ |$$ |__$$ |    /$$/  
  $$ |$$    $$ |   /$$/   
  $$ |$$$$$$$$ |  /$$/    
 _$$ |_     $$ | /$$/     
/ $$   |    $$ |/$$/      
$$$$$$/     $$/ $$/       
${amarelo}\n              software is our thing.${reset}
`;

const esperarEnter = () => {
	return new Promise((resolve) => {
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
		});

		console.log(
			centralizarTexto(
				`${amarelo}[Para parar de checar, pressione qualquer tecla.]${reset}\n`,
				4,
			),
		);

		rl.question("", () => {
			rl.close();
			resolve();
		});
	});
};

function prompt(question) {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});
	return new Promise((resolve) =>
		rl.question(question, (answer) => {
			rl.close();
			resolve(answer);
		}),
	);
}

function pegarPlataforma() {
	const platform = process.platform;
	const arch = process.arch;

	if (platform === "linux") {
		if (arch === "x64") return "linux-x86_64";
		if (arch === "ia32") return "linux-i686";
	} else if (platform === "darwin") {
		if (arch === "x64") return "macos-x86_64";
		if (arch === "arm64") return "macos-aarch64";
	} else if (platform === "win32") {
		if (arch === "x64") return "windows-x86_64";
		if (arch === "ia32") return "windows-i686";
	} else if (platform === "android") {
		if (arch === "arm64") return "android-aarch64";
		if (arch === "arm") return "android-armv7";
		if (arch === "x64") return "android-x86_64";
		if (arch === "ia32" || arch === "x86") return "android-x86";
	}

	console.clear();
	console.log(`${erro} Plataforma não suportada: ${platform}-${arch}`);
	process.exit();
}

function centralizarTexto(text, space) {
	return text
		.split(/\r?\n/)
		.map((line, _, lines) => {
			const spacesCount =
				space !== undefined
					? space
					: Math.floor(
							(process.stdout.columns -
								lines[Math.floor(lines.length / 2)].length) /
								2,
						);
			return " ".repeat(spacesCount) + line;
		})
		.join("\n");
}

async function fetchHTML(url, usar_agent = false) {
	if (usar_agent) {
		const options = { agent };
		const res = await fetchSeguro(url, options);
		return await res.text();
	}

	return new Promise((resolve, reject) => {
		https
			.get(url, (res) => {
				let data = "";
				res.on("data", (chunk) => (data += chunk));
				res.on("end", () => resolve(data));
			})
			.on("error", reject);
	});
}

function downloadFile(url, destination) {
	return new Promise((resolve, reject) => {
		const arquivo = fs.createWriteStream(destination);
		https
			.get(url, (res) => {
				res.pipe(arquivo);
				arquivo.on("finish", () => arquivo.close(resolve));
			})
			.on("error", (err) => {
				fs.unlink(destination, () => reject(err));
			});
	});
}

async function fetchSeguro(url, options, retries = 3) {
	for (let i = 0; i < retries; i++) {
		try {
			return await fetch(url, options);
		} catch (err) {
			if (
				err.message.includes("Socks5 proxy rejected connection") &&
				i < retries - 1
			) {
				console.log(
					`${amarelo}Conexão rejeitada pelo Tor, trocando IP e tentando de novo...${reset}`,
				);
				await novoCircuitoTor();
				await new Promise((r) => setTimeout(r, 2000));
				continue;
			}
			throw err;
		}
	}
}

async function novoCircuitoTor() {
	return new Promise((resolve, reject) => {
		const socket = net.connect({ port: 9051 }, () => {
			socket.write('AUTHENTICATE ""\r\n');
			socket.write("SIGNAL NEWNYM\r\n");
			socket.write("QUIT\r\n");
		});
		socket.on("data", (data) => {
			if (data.toString().includes("250 OK")) resolve();
		});
		socket.on("error", reject);
	});
}

async function enviarWebhook(nick, plataforma) {
	const { enviar_validos, webhook, mensagem } = config();
	if (!enviar_validos || !webhook) return;
	try {
		const u = new URL(webhook);
		if (
			![
				"ptb.discord.com",
				"canary.discord.com",
				"discord.com",
				"discordapp.com",
			].includes(u.hostname) ||
			!u.pathname.startsWith("/api/webhooks/")
		)
			return;
		await fetch(webhook, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				content: (
					mensagem ||
					"Nick disponível: {nick} ({plataforma})\n-# checker feito por [147enterprise](<https://github.com/147enterprise>)\n@everyone"
				)
					.replaceAll("{nick}", nick)
					.replaceAll("{plataforma}", plataforma),
			}),
		});
	} catch {}
}

function extrairTarGz(file, path_saida) {
	return new Promise((resolve, reject) => {
		exec(`tar -xzf "${file}" -C "${path_saida}"`, (err, stdout, stderr) => {
			if (err) return reject(stderr || err);
			resolve(stdout);
		});
	});
}

function garantirExe(filePath) {
	const conteudo = `
MaxCircuitDirtiness 1
CircuitBuildTimeout ${config().delay_troca_ips}
LearnCircuitBuildTimeout 0
ControlPort 9051
CookieAuthentication 0
`.trim();

	fs.writeFileSync(path.join(path.dirname(filePath), "torrc"), conteudo);

	return new Promise((resolve, reject) => {
		if (process.platform === "win32") return resolve();
		fs.chmod(filePath, 0o755, (err) => {
			if (err) return reject(err);
			resolve();
		});
	});
}

function esperarTor(port = 9050, host = "127.0.0.1", timeout = 15000) {
	return new Promise((resolve, reject) => {
		const comeco = Date.now();
		let timeoutId;

		function check() {
			const socket = net.createConnection({ port, host }, () => {
				socket.destroy();
				clearTimeout(timeoutId);
				resolve();
			});

			socket.on("error", () => {
				socket.destroy();
				if (Date.now() - comeco > timeout) {
					clearTimeout(timeoutId);
					reject(
						new Error("Tor não respondeu na porta 9050 dentro do tempo limite"),
					);
				} else {
					timeoutId = setTimeout(check, 500);
				}
			});
		}

		check();
	});
}

function gerarUsername(tamanho, charset) {
	return [...Array(tamanho)]
		.map(() => charset[Math.floor(Math.random() * charset.length)])
		.join("");
}

async function pegarOpcoesUsernames({
	minimo = 2,
	maximo = 32,
	desativar_numeros = false,
} = {}) {
	let tamanho;
	while (true) {
		console.clear();
		console.log(centralizarTexto(arte));

		const input = await prompt(
			`Quantos caracteres o username deve ter? (${minimo} a ${maximo})\n${roxo}> ${reset}`,
		);
		const num = Number(input.trim());
		if (Number.isInteger(num) && num >= minimo && num <= maximo) {
			tamanho = num;
			break;
		}
	}

	console.clear();
	console.log(centralizarTexto(arte));

	console.log("\nEscolha o tipo de caracteres:\n");

	const todasOpcoes = [
		{
			label: "Somente letras (a-z)",
			charset: "abcdefghijklmnopqrstuvwxyz",
			desativado: false,
		},
		{
			label: "Letras e números (a-z, 0-9)",
			charset: "abcdefghijklmnopqrstuvwxyz0123456789",
			desativado: false,
		},
		{
			label: "Somente números (0-9)",
			charset: "0123456789",
			desativado: desativar_numeros,
		},
	];
	const opcoesDisponiveis = todasOpcoes.filter((op) => !op.desativado);

	opcoesDisponiveis.forEach((op, i) => {
		const ehUltima = i === opcoesDisponiveis.length - 1;
		console.log(
			`[${roxo} ${i + 1} ${reset}] ${op.label}${ehUltima ? "\n" : ""}`,
		);
	});

	let charset = "";
	while (true) {
		const escolha = await prompt(`${roxo_2}>${reset} `);
		const index = parseInt(escolha) - 1;

		if (!isNaN(index) && index >= 0 && index < opcoesDisponiveis.length) {
			charset = opcoesDisponiveis[index].charset;
			break;
		}
		console.log(`${erro} Opção inválida. Escolha uma das opções disponíveis.`);
	}

	return { tamanho, charset };
}

async function pararTor() {
	const cmd =
		process.platform === "win32"
			? "taskkill /IM tor.exe /F"
			: 'pkill -f "/tor" || true';

	try {
		await execSync(cmd, { stdio: "ignore" });
	} catch {}
}

async function limparTor(dir) {
	if (fs.existsSync(dir)) {
		console.log(`[${roxo_2} ! ${reset}] Apagando diretório antigo: ${dir}`);
		await pararTor();
		await fsp.rm(dir, { recursive: true, force: true });
	}
}

async function selecionarArquivo(extensao) {
	if (process.platform === "win32") {
		const psScript = `
      Add-Type -AssemblyName System.Windows.Forms
      $ofd = New-Object System.Windows.Forms.OpenFileDialog
      $ofd.Filter = "${extensao.toUpperCase()} files (*.${extensao})|*.${extensao}"
      $ofd.Title = "Selecione o arquivo .${extensao}"
      if ($ofd.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        Write-Output $ofd.FileName
      }
    `;

		console.log(
			centralizarTexto(
				`[${roxo_2} ! ${reset}] Selecione o arquivo com extensão ${amarelo}.${extensao}${reset}`,
				1,
			),
		);

		const child = spawnSync("powershell.exe", ["-Command", psScript], {
			encoding: "utf8",
			windowsHide: true,
		});

		const caminho = child.stdout.toString().trim();
		return caminho || null;
	} else {
		const eu = process.pkg
			? path.basename(process.execPath)
			: path.basename(__filename);

		const caminho = await prompt(
			`Caminho do arquivo .${extensao}:\n${roxo}> ${reset}`,
		);

		const caminhoResolvido = path.resolve(caminho);

		if (!fs.existsSync(caminhoResolvido)) {
			console.clear();
			console.log(
				`${erro} Não achei o arquivo "${caminhoResolvido}", coloque-o na mesma pasta que eu (${eu}) e tente novamente.`,
			);
			await sleep(8000);
			return null;
		}

		const ext = path.extname(caminhoResolvido).slice(1).toLowerCase();
		if (ext !== extensao.toLowerCase()) {
			console.clear();
			console.log(
				`${erro} O arquivo deve ter a extensão ${amarelo}.${extensao}${reset}.`,
			);
			await sleep(8000);
			return null;
		}

		return caminhoResolvido;
	}
}

function iniciarTor(torDir) {
	return new Promise(async (resolve, reject) => {
		try {
			const caminho_tor =
				process.platform === "android"
					? path.join(torDir, "libTor.so")
					: process.platform === "win32"
						? path.join(torDir, "tor.exe")
						: path.join(torDir, "tor");

			if (!fs.existsSync(caminho_tor)) {
				return reject(
					new Error(`Arquivo Tor não encontrado em: ${caminho_tor}`),
				);
			}

			await garantirExe(caminho_tor);
			console.log(`[${roxo_2} + ${reset}] Iniciando Tor: ${caminho_tor}`);

			const caminho_exe = path.dirname(caminho_tor);
			const caminho_torrc = path.join(caminho_exe, "torrc");
			const tor = spawn(caminho_tor, ["-f", caminho_torrc], {
				cwd: torDir,
				stdio: "ignore",
			});

			tor.once("error", (err) => {
				console.log(`${erro} Erro ao iniciar Tor: ${err.message}`);
				reject(err);
			});

			console.log(`[${roxo_2} + ${reset}] Esperando Tor abrir porta 9050...`);
			await esperarTor();
			resolve();
		} catch (err) {
			reject(err);
		}
	});
}

function salvarTxt(username, arquivo) {
	if (!config().salvar_validos) return;

	const caminho = path.resolve(arquivo);

	try {
		if (
			fs.existsSync(caminho) &&
			fs.readFileSync(caminho, "utf8").includes(username + "\n")
		)
			return;

		fs.appendFileSync(caminho, username + "\n", "utf8");
	} catch (err) {
		console.log(`${erro} Erro ao salvar username: ${err.message}`);
	}
}

async function escolherModoUsername() {
	console.clear();
	console.log(centralizarTexto(arte));
	console.log(
		centralizarTexto(
			`
Escolha a origem dos usernames:

[${roxo} 1 ${reset}] Gerar usernames aleatórios
[${roxo} 2 ${reset}] Carregar usernames de um arquivo .txt

[${roxo} 3 ${reset}] Voltar
`,
			4,
		),
	);

	const resposta = await prompt(centralizarTexto(`${roxo_2}>${reset} `, 4));
	switch (resposta) {
		case "1":
			return { modo: "gerar" };

		case "2": {
			console.clear();

			const caminho = await selecionarArquivo("txt");
			if (!caminho) {
				console.clear();
				console.log(`${erro} Nenhum arquivo selecionado.`);
				await sleep(5000);
				return escolherModoUsername();
			}

			try {
				const conteudo = fs.readFileSync(caminho, "utf8");
				const lista = conteudo
					.split(/\r?\n/)
					.map((l) => l.trim())
					.filter((l) => l.length > 0);

				if (lista.length === 0) throw new Error("Arquivo vazio.");

				return { modo: "arquivo", lista };
			} catch (e) {
				console.clear();
				console.log(`${erro} Erro ao ler o arquivo: ${e.message}`);
				await sleep(5000);
				return escolherModoUsername();
			}
		}

		case "3":
			return null;

		default:
			console.clear();
			console.log(`${erro} Opção inválida.`);
			await sleep(1500);
			return escolherModoUsername();
	}
}

async function requestsDiscord(tamanho, charset, lista = null) {
	process.title = "147Company™ | Checker de usernames. | Discord.";

	console.clear();
	console.log(centralizarTexto(arte));

	let parar = false;
	let indice = 0;

	const aguardar = esperarEnter();
	aguardar.then(() => (parar = true));

	while (!parar) {
		const ip = await fetchHTML("https://whatismyip.akamai.com", true);
		const username = lista ? lista[indice++] : gerarUsername(tamanho, charset);
		if (lista && indice >= lista.length) break;

		const body = JSON.stringify({ username });

		try {
			const res = await fetchSeguro(
				"https://discord.com/api/v9/unique-username/username-attempt-unauthed",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body,
				},
			);

			if (res.status === 429) {
				console.log(
					centralizarTexto(
						`${erro} rate-limit (IP: ${ip}), esperando troca de IP.\n`,
						4,
					),
				);
				await sleep(parseInt(config().delay_troca_ips) * 1000 + 1000);
				continue;
			}

			const json = await res.json();

			if (!json.taken) {
				salvarTxt(username, "validos_discord.txt");
				enviarWebhook(username, "Discord");
			}

			console.log(
				centralizarTexto(
					`[ ${roxo_2}!${reset} ] username ${roxo_2}${username}${reset} ${
						json.taken
							? `${vermelho}indisponível${reset}\n`
							: `${verde}disponível${reset}\n`
					}`,
					4,
				),
			);
		} catch (e) {
			console.log(`${erro} Erro na requisição via Tor: ${e.message}`);
		}

		await sleep(parseInt(config().delay_requests));
	}

	if (lista) {
		console.log(
			centralizarTexto(
				`${amarelo}[Lista finalizada, pressione qualquer tecla para voltar ao menu.]${reset}`,
				4,
			),
		);
		await prompt("");
	}

	return menu();
}

async function configurar() {
	while (true) {
		console.clear();
		console.log(centralizarTexto(arte));
		console.log(
			centralizarTexto(
				`
[${roxo} 1 ${reset}] Alterar delay entre checagens (atual: ${amarelo}${config().delay_requests / 1000} segundos${reset})
[${roxo} 2 ${reset}] Alterar delay entre troca de IPs (atual: ${amarelo}${config().delay_troca_ips} segundos${reset})
[${roxo} 3 ${reset}] Ativar/desativar save de usernames disponíveis (atual: ${amarelo}${config().salvar_validos ? `${verde}ativado` : `${vermelho}desativado`}${reset})
[${roxo} 4 ${reset}] Configurar envio pro webhook (atual: ${amarelo}${config().enviar_validos ? `${verde}ativado` : `${vermelho}desativado`}${reset})

[${roxo} 5 ${reset}] Voltar
    `,
				4,
			),
		);

		const resposta = await prompt(centralizarTexto(`${roxo_2}>${reset} `, 4));
		let conf = config();
		if (resposta === "5") return menu();

		switch (resposta) {
			case "1": {
				console.clear();
				const novoDelay = await prompt(
					centralizarTexto(
						`Novo delay entre checagens (em segundos):\n${roxo}> ${reset}`,
						4,
					),
				);
				const valor = parseInt(novoDelay);
				if (!isNaN(valor) && valor >= 0) {
					conf.delay_requests = Math.round(valor * 1000).toString();
					fs.writeFileSync("config.json", JSON.stringify(conf, null, 4));
					console.log(
						`${verde}Delay entre checagens atualizado com sucesso.${reset}`,
					);
				} else {
					console.clear();
					console.log(`${erro} Valor inválido.`);
				}
				await sleep(1500);
				break;
			}

			case "2": {
				console.clear();
				const novoDelay = await prompt(
					centralizarTexto(
						`Novo delay entre troca de IPs (em segundos):\n${roxo}> ${reset}`,
						4,
					),
				);
				const valor = parseInt(novoDelay);
				if (!isNaN(valor) && valor >= 0) {
					conf.delay_troca_ips = valor.toString();
					fs.writeFileSync("config.json", JSON.stringify(conf, null, 4));
					console.log(
						`${verde} Delay de troca de IPs atualizado com sucesso.${reset}`,
					);
				} else {
					console.clear();
					console.log(`${erro} Valor inválido.`);
				}
				await sleep(1500);
				break;
			}

			case "3": {
				conf.salvar_validos = !conf.salvar_validos;
				fs.writeFileSync("config.json", JSON.stringify(conf, null, 4));
				console.log(
					`${verde}Save de usernames disponíveis ${conf.salvar_validos ? "ativado" : `${vermelho}desativado`}.${reset}`,
				);
				await sleep(1500);
				break;
			}

			case "4": {
				console.clear();
				console.log(
					centralizarTexto(
						`
[${roxo} 1 ${reset}] Ativar/desativar (atual: ${amarelo}${config().enviar_validos ? `${verde}ativado` : `${vermelho}desativado`}${reset})
[${roxo} 2 ${reset}] Alterar webhook
[${roxo} 3 ${reset}] Alterar mensagem do webhook

[${roxo} 4 ${reset}] Voltar
            			`,
						4,
					),
				);

				const subresposta = await prompt(`\n${roxo}> ${reset}`);
				let subconf = config();

				if (subresposta === "4") {
					await sleep(1500);
					break;
				}

				switch (subresposta) {
					case "1": {
						subconf.enviar_validos = !subconf.enviar_validos;
						if (subconf.enviar_validos) {
							subconf.mensagem =
								"Nick disponível: {nick} ({plataforma})\n-# checker feito por [147enterprise](<https://github.com/147enterprise>)\n@everyone";
						}
						fs.writeFileSync("config.json", JSON.stringify(subconf, null, 4));
						console.log(
							`${verde}Envio para webhook ${subconf.enviar_validos ? "ativado" : `${vermelho}desativado`}.${reset}`,
						);
						await sleep(1500);
						break;
					}

					case "2": {
						console.clear();
						console.log(
							centralizarTexto(
								`Webhook atual: ${verde}${config().webhook || "Nenhum"}${reset}\n`,
								1,
							),
						);

						const novoWebhook = await prompt(
							centralizarTexto(`Novo webhook:\n${roxo}> ${reset}`, 1),
						);
						if (novoWebhook.trim()) {
							try {
								const u = new URL(novoWebhook.trim());
								if (
									![
										"ptb.discord.com",
										"canary.discord.com",
										"discord.com",
										"discordapp.com",
									].includes(u.hostname) ||
									!u.pathname.includes("/api/webhooks")
								) {
									console.log(`${erro} Webhook inválido.`);
									await sleep(1500);
									break;
								}
								subconf.webhook = novoWebhook.trim();
								fs.writeFileSync(
									"config.json",
									JSON.stringify(subconf, null, 4),
								);
								console.log(`${verde}Webhook atualizado com sucesso.${reset}`);
							} catch {
								console.log(`${erro} Webhook inválido.`);
							}
						} else {
							console.log(`${erro} Webhook inválido.`);
						}
						await sleep(1500);
						break;
					}

					case "3": {
						console.clear();
						console.log(
							centralizarTexto(
								`Mensagem atual: ${verde}${(subconf.mensagem || "Nenhuma (ative o enviar pro webhook pra mensagem padrão ser definida)").replace(/\n/g, "\\n")}${reset}\n\n` +
									`{nick} serve como placeholder para ser substituido pelo nome disponível.\n` +
									`{plataforma} serve também como placeholder mas para ser substituido pelo nome do site alvo da checagem.\n` +
									`Use \\n para quebrar linhas.\n`,
								1,
							),
						);
						const novaMensagem = await prompt(`${roxo}> ${reset}`);
						if (novaMensagem.trim()) {
							subconf.mensagem = novaMensagem;
							fs.writeFileSync("config.json", JSON.stringify(subconf, null, 4));
							console.log(
								`${verde}Mensagem do webhook atualizada com sucesso.${reset}`,
							);
						} else {
							console.log(`${erro} Mensagem inválida.`);
						}
						await sleep(1500);
						break;
					}

					default:
						console.clear();
						console.log(`${erro} Opção inválida.`);
						await sleep(1500);
				}

				break;
			}

			default:
				console.clear();
				console.log(`${erro} Opção inválida.`);
				await sleep(1500);
		}
	}
}

async function iniciar_discord() {
	process.title = "147Company™ | Checker de usernames. | Discord.";
	try {
		console.clear();
		const identificador = pegarPlataforma();
		console.log(`[${roxo_2} + ${reset}] Sistema detectado: ${identificador}`);

		const html = await fetchHTML(DOWNLOAD_URL);
		const regex = new RegExp(
			`<a href="(tor-expert-bundle-${identificador}-14\\.5\\.4\\.tar\\.gz)">`,
			"i",
		);

		const match = html.match(regex);
		if (!match) throw new Error("Arquivo apropriado não encontrado.");

		const nome_arquivo = match[1];
		const fullUrl = DOWNLOAD_URL + nome_arquivo;
		const downloadPath = path.join(os.tmpdir(), nome_arquivo);

		console.log(`[${roxo_2} + ${reset}] Baixando: ${fullUrl}`);
		await downloadFile(fullUrl, downloadPath);
		console.log(`[${roxo_2} + ${reset}] Download concluído: ${downloadPath}`);

		const pastaSaida = path.resolve(
			process.pkg ? process.cwd() : __dirname,
			"tor_extraido",
		);
		await limparTor(pastaSaida);
		fs.mkdirSync(pastaSaida);

		console.log(`[${roxo_2} + ${reset}] Extraindo para: ${pastaSaida}`);
		await extrairTarGz(downloadPath, pastaSaida);
		console.log(`[${roxo_2} + ${reset}] Extração concluída com sucesso.`);

		const pastaTor = path.join(pastaSaida, "tor");
		await iniciarTor(pastaTor);

		const escolha = await escolherModoUsername();
		if (!escolha) return menu();

		if (escolha.modo === "gerar") {
			const { tamanho, charset } = await pegarOpcoesUsernames();
			await requestsDiscord(tamanho, charset);
		} else {
			await requestsDiscord(null, null, escolha.lista);
		}
	} catch (e) {
		console.log(`${erro} Erro: ${e.message}`);
	}
}

async function requestsTiktok(tamanho, charset, lista = null) {
	process.title = "147Company™ | Checker de usernames. | TikTok.";

	console.clear();
	console.log(centralizarTexto(arte));
	console.log(
		centralizarTexto(
			`${amarelo}[Nicks bloqueados pelo TikTok podem aparecer como disponíveis. Checagem não é 100% precisa.]`,
			4,
		),
	);

	let parar = false;
	let indice = 0;

	const aguardar = esperarEnter();
	aguardar.then(() => (parar = true));

	while (!parar) {
		const username = lista ? lista[indice++] : gerarUsername(tamanho, charset);
		if (lista && indice >= lista.length) break;

		const url = `https://www.tiktok.com/@${username}?isUniqueId=true&isSecured=true`;

		let raw = "";
		let statusCode = 0;
		let tentativas = 0;

		while (raw.length < 200000 && tentativas < 5) {
			tentativas++;

			const resultado = await new Promise((resolve) => {
				let data = "";
				let status = 0;
				const req = https.get(
					url,
					{
						headers: {
							"user-agent":
								"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
						},
					},
					(res) => {
						status = res.statusCode;
						res.on("data", (chunk) => {
							data += chunk;
						});
						res.on("end", () => {
							resolve({ status, body: data });
						});
					},
				);

				req.on("error", (err) => {
					console.log(`${erro} Erro ao requisitar ${url}: ${err.message}`);
					resolve({ status: 0, body: "" });
				});
			});

			raw = resultado.body;
			statusCode = resultado.status;

			if (!raw) await sleep(500);
		}

		const temUniqueId = /"uniqueId":"[^"]+"/.test(raw);

		if (statusCode === 200 && temUniqueId) {
			console.log(
				centralizarTexto(
					`[ ${roxo_2}!${reset} ] username ${roxo_2}${username}${reset} ${vermelho}indisponível${reset}\n`,
					4,
				),
			);
		} else {
			enviarWebhook(username, "TikTok");
			salvarTxt(username, "validos_tiktok.txt");
			console.log(
				centralizarTexto(
					`[ ${roxo_2}!${reset} ] O username ${roxo_2}${username}${reset} está ${verde}disponível${reset}\n`,
					4,
				),
			);
		}

		await sleep(parseInt(config().delay_requests));
	}

	if (lista) {
		console.log(
			centralizarTexto(
				`${amarelo}[Lista finalizada, pressione qualquer tecla para voltar ao menu.]${reset}`,
				4,
			),
		);
		await prompt("");
	}

	return menu();
}

async function iniciar_tiktok() {
	const escolha = await escolherModoUsername();
	if (!escolha) return menu();

	if (escolha.modo === "gerar") {
		const { tamanho, charset } = await pegarOpcoesUsernames({
			minimo: 2,
			maximo: 24,
			desativar_numeros: true,
		});
		await requestsTiktok(tamanho, charset);
	} else {
		await requestsTiktok(null, null, escolha.lista);
	}
}

async function perguntar_rede_social() {
	console.clear();
	console.log(centralizarTexto(arte));
	console.log(
		centralizarTexto(
			`
[${roxo} 1 ${reset}] Discord
[${roxo} 2 ${reset}] TikTok

[${roxo} 3 ${reset}] Voltar
    `,
			4,
		),
	);
	const resposta = await prompt(centralizarTexto(`${roxo_2}>${reset} `, 4));

	switch (resposta) {
		case "1":
			return iniciar_discord();
			break;
		case "2":
			return iniciar_tiktok();
			break;
		case "3":
			return menu();
			break;
		default:
			console.clear();
			console.log(`${erro} Opção inválida.`);
			process.exit();
	}
}

async function menu() {
	console.clear();
	console.log(centralizarTexto(arte));
	console.log(
		centralizarTexto(
			`
[${roxo} 1 ${reset}] Iniciar checagem
[${roxo} 2 ${reset}] Configurar

[${roxo} 3 ${reset}] Sair
    `,
			4,
		),
	);
	const resposta = await prompt(centralizarTexto(`${roxo_2}>${reset} `, 4));

	switch (resposta) {
		case "1":
			return perguntar_rede_social();
			break;
		case "2":
			return configurar();
			break;
		case "3":
			process.exit();
		default:
			console.clear();
			console.log(`${erro} Opção inválida.`);
			process.exit();
	}
}

menu();
