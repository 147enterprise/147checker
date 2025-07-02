process.title = "147Company™ | Checker de usernames.";

const https = require("https");
const fs = require("fs");
const { exec, spawn, execSync } = require("child_process");
const { SocksProxyAgent } = require("socks-proxy-agent");
const os = require("os");
const path = require("path");
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

function fetchHTML(url, usar_agent = false) {
	return new Promise((resolve, reject) => {
		const opcoes = usar_agent ? { agent } : {};

		https
			.get(url, opcoes, (res) => {
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
			const socket = require("net").createConnection({ port, host }, () => {
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
		fs.appendFileSync(caminho, username + "\n", "utf8");
	} catch (err) {
		console.log(`${erro} Erro ao salvar username: ${err.message}`);
	}
}

async function requestsDiscord(tamanho, charset) {
	process.title = "147Company™ | Checker de usernames. | Discord";
	console.clear();
	console.log(centralizarTexto(arte));

	while (true) {
		const ip = await fetchHTML("https://whatismyip.akamai.com", true);
		const username = gerarUsername(tamanho, charset);
		const body = JSON.stringify({ username });

		const opcoes = {
			hostname: "discord.com",
			port: 443,
			path: "/api/v9/unique-username/username-attempt-unauthed",
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Content-Length": Buffer.byteLength(body),
			},
			agent,
		};

		await new Promise((resolve) => {
			const req = https.request(opcoes, (res) => {
				let data = "";
				res.on("data", (chunk) => (data += chunk));
				res.on("end", async () => {
					if (res.statusCode === 429) {
						console.log(
							centralizarTexto(
								`${erro} rate-limit (IP: ${ip}), esperando troca de IP.\n`,
								4,
							),
						);
						await sleep(parseInt(config().delay_troca_ips) * 1000 + 1000);
						return resolve();
					}

					try {
						const json = JSON.parse(data);

						!json.taken && salvarTxt(username, "validos_discord.txt");
						console.log(
							centralizarTexto(
								`[ ${roxo_2}!${reset} ] username ${roxo_2}${username}${reset} ${json.taken ? `${vermelho}indisponível${reset}\n` : `${verde}disponível${reset}\n`}`,
								4,
							),
						);
					} catch (e) {
						console.log(
							`${erro} Erro ao processar resposta JSON: ${e.message}`,
						);
					}

					resolve();
				});
			});

			req.on("error", (err) => {
				console.log(`${erro} Erro na requisição via Tor: ${err.message}`);
				resolve();
			});

			req.write(body);
			req.end();
		});

		await sleep(parseInt(config().delay_requests));
	}
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

[${roxo} 4 ${reset}] Voltar
    `,
				4,
			),
		);

		const resposta = await prompt(centralizarTexto(`${roxo_2}>${reset} `, 4));
		let conf = config();
		if (resposta === "4") return menu();

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

		const pastaSaida = path.resolve(__dirname, "tor_extraido");
		await limparTor(pastaSaida);
		fs.mkdirSync(pastaSaida);

		console.log(`[${roxo_2} + ${reset}] Extraindo para: ${pastaSaida}`);
		await extrairTarGz(downloadPath, pastaSaida);
		console.log(`[${roxo_2} + ${reset}] Extração concluída com sucesso.`);

		const pastaTor = path.join(pastaSaida, "tor");
		await iniciarTor(pastaTor);

		const { tamanho, charset } = await pegarOpcoesUsernames();
		await requestsDiscord(tamanho, charset);
	} catch (e) {
		console.log(`${erro} Erro: ${e.message}`);
	}
}

async function requestsTiktok(tamanho, charset) {
	process.title = "147Company™ | Checker de usernames. | TikTok.";
	console.clear();
	console.log(centralizarTexto(arte));

	while (true) {
		const username = gerarUsername(tamanho, charset);
		const url = `https://www.tiktok.com/@${username}`;

		let raw = "";
		let tentativas = 0;

		while (raw.length < 200000 && tentativas < 5) {
			tentativas++;
			raw = await fetchHTML(url);
			if (!raw) {
				await sleep(500);
			}
		}

		if (raw.length < 200000) {
			console.log(
				`${erro} Não foi possível obter página TikTok completa para ${username}`,
			);
			await sleep(parseInt(config().delay_requests));
			continue;
		}

		const indisponivel = raw.toLowerCase().includes("followingcount");

		if (indisponivel) {
			console.log(
				centralizarTexto(
					`[ ${roxo_2}!${reset} ] username ${roxo_2}${username}${reset} ${vermelho}indisponível${reset}\n`,
					4,
				),
			);
		} else {
			salvarTxt(username, "validos_tiktok.txt");
			console.log(
				centralizarTexto(
					`[ ${roxo_2}!${reset} ] username ${roxo_2}${username}${reset} ${verde}disponível${reset}\n`,
					4,
				),
			);
		}

		await sleep(parseInt(config().delay_requests));
	}
}

async function iniciar_tiktok() {
	const { tamanho, charset } = await pegarOpcoesUsernames({
		minimo: 2,
		maximo: 24,
		desativar_numeros: true,
	});
	await requestsTiktok(tamanho, charset);
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
