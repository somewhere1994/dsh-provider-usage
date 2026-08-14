var ProviderError = class extends Error {
	constructor(code, message) {
		super(message);
		this.name = "ProviderError";
		this.code = code;
	}
};
const DECIMAL = /^\d+(?:\.\d+)?$/u;
function malformed() {
	return new ProviderError("malformed", "Provider returned malformed usage data");
}
function record(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
function nonNegativeDecimal(value) {
	if (typeof value !== "string" || value.length === 0 || value.length > 64 || !DECIMAL.test(value)) throw malformed();
	return value;
}
function isoTime(value) {
	if (typeof value !== "string" || value.length === 0) throw malformed();
	const time = new Date(value);
	if (!Number.isFinite(time.getTime())) throw malformed();
	return time.toISOString();
}
function allowance(value) {
	if (!record(value)) throw malformed();
	const parsed = {
		limit: nonNegativeDecimal(value.limit),
		remaining: nonNegativeDecimal(value.remaining),
		resetTime: isoTime(value.resetTime)
	};
	if (value.used !== void 0) parsed.used = nonNegativeDecimal(value.used);
	return parsed;
}
function parseDeepSeekBalance(value) {
	if (!record(value) || typeof value.is_available !== "boolean" || !Array.isArray(value.balance_infos)) throw malformed();
	return {
		available: value.is_available,
		balances: value.balance_infos.map((item) => {
			if (!record(item) || item.currency !== "CNY" && item.currency !== "USD") throw malformed();
			return {
				currency: item.currency,
				total: nonNegativeDecimal(item.total_balance),
				granted: nonNegativeDecimal(item.granted_balance),
				toppedUp: nonNegativeDecimal(item.topped_up_balance)
			};
		})
	};
}
function minuteWindow(value) {
	if (!record(value) || !Number.isInteger(value.duration) || value.duration <= 0) throw malformed();
	if (value.timeUnit === "TIME_UNIT_MINUTE") return value.duration;
	if (value.timeUnit === "TIME_UNIT_HOUR") return value.duration * 60;
	throw malformed();
}
function parseKimiUsage(value) {
	if (!record(value) || !record(value.usage) || !Array.isArray(value.limits)) throw malformed();
	const usage = allowance(value.usage);
	const limits = value.limits.map((item) => {
		if (!record(item) || !record(item.window)) throw malformed();
		return {
			durationMinutes: minuteWindow(item.window),
			...allowance(item.detail)
		};
	});
	return {
		usage,
		limits,
		rolling5h: limits.find((item) => item.durationMinutes === 300) ?? null,
		weekly7d: limits.find((item) => item.durationMinutes === 10080) ?? usage
	};
}
const REQUEST_HEADERS = {
	accept: "application/json",
	"user-agent": `dsh-provider-usage/0.2.0`
};
function httpError(status) {
	if (status === 401 || status === 403) return new ProviderError("auth", "Provider rejected the configured credential");
	if (status === 429) return new ProviderError("rate-limited", "Provider rate limit reached");
	return new ProviderError("unavailable", "Provider usage is temporarily unavailable");
}
async function readJson({ url, apiKey, fetcher, signal, parse }) {
	let response;
	try {
		response = await fetcher(url, {
			method: "GET",
			redirect: "error",
			headers: {
				authorization: `Bearer ${apiKey}`,
				...REQUEST_HEADERS
			},
			signal
		});
	} catch (error) {
		if (error?.name === "AbortError" || error?.name === "TimeoutError") throw new ProviderError("timeout", "Provider usage request timed out");
		throw new ProviderError("unavailable", "Provider usage is temporarily unavailable");
	}
	if (!response.ok) throw httpError(response.status);
	let value;
	try {
		value = await response.json();
	} catch {
		throw malformed();
	}
	return parse(value);
}
function readDeepSeek({ apiKey, fetcher = fetch, signal } = {}) {
	return readJson({
		url: "https://api.deepseek.com/user/balance",
		apiKey,
		fetcher,
		signal,
		parse: parseDeepSeekBalance
	});
}
function readKimi({ apiKey, fetcher = fetch, signal } = {}) {
	return readJson({
		url: "https://api.kimi.com/coding/v1/usages",
		apiKey,
		fetcher,
		signal,
		parse: parseKimiUsage
	});
}
const DEEPSEEK_REF = "DEEPSEEK_API_KEY";
const KIMI_REF = "KIMI_CODING_API_KEY";
function resultForCaller(promise, signal) {
	if (signal === void 0) return promise.then(structuredClone);
	if (signal.aborted) return Promise.reject(signal.reason);
	return new Promise((resolve, reject) => {
		const finish = (callback, value) => {
			signal.removeEventListener("abort", onAbort);
			callback(value);
		};
		const onAbort = () => finish(reject, signal.reason);
		signal.addEventListener("abort", onAbort, { once: true });
		promise.then((value) => finish(resolve, structuredClone(value)), (error) => finish(reject, error));
	});
}
function publicFailure(error) {
	return {
		ok: false,
		error: { code: error instanceof ProviderError ? error.code : "unavailable" }
	};
}
function createUsageService(options) {
	const credentials = options.credentials;
	const fetcher = options.fetcher ?? fetch;
	const now = options.now ?? Date.now;
	const ttlMs = options.ttlMs ?? 25e3;
	const timeoutMs = options.timeoutMs ?? 15e3;
	let cached;
	let inFlight;
	const loadProvider = async (ref, read, signal) => {
		try {
			const resolved = await credentials.resolve(ref);
			if (resolved === void 0) return {
				ok: false,
				error: { code: "credential-missing" }
			};
			return {
				ok: true,
				value: await read({
					apiKey: resolved.value,
					fetcher,
					signal
				})
			};
		} catch (error) {
			return publicFailure(error);
		}
	};
	const load = async () => {
		const timeout = AbortSignal.timeout(timeoutMs);
		const [deepseek, kimi] = await Promise.all([loadProvider(DEEPSEEK_REF, readDeepSeek, timeout), loadProvider(KIMI_REF, readKimi, timeout)]);
		return {
			fetchedAt: now(),
			deepseek,
			kimi
		};
	};
	return Object.freeze({ read({ force = false, signal } = {}) {
		if (inFlight !== void 0) return resultForCaller(inFlight, signal);
		if (!force && cached !== void 0 && now() - cached.fetchedAt < ttlMs) return Promise.resolve(structuredClone(cached));
		const current = load().then((value) => {
			cached = structuredClone(value);
			return structuredClone(value);
		}).finally(() => {
			if (inFlight === current) inFlight = void 0;
		});
		inFlight = current;
		return resultForCaller(inFlight, signal);
	} });
}
//#endregion
//#region src/index.js
const name = "provider-usage";
const inject = ["credentials", "connection"];
function createRpcHandler(service) {
	return async (endpoint, payload, signal) => {
		if (endpoint !== "usage/read") return {
			ok: false,
			error: {
				code: "not-found",
				message: "Unknown provider usage endpoint"
			}
		};
		try {
			return {
				ok: true,
				value: await service.read({
					force: payload?.force === true,
					signal
				})
			};
		} catch {
			return {
				ok: false,
				error: {
					code: "internal",
					message: "Usage is temporarily unavailable"
				}
			};
		}
	};
}
function apply(ctx) {
	const handler = createRpcHandler(createUsageService({ credentials: ctx.credentials }));
	ctx.effect(() => ctx.connection.rpc.handle("/dsh-provider-usage", handler, { authority: "loopback" }), "provider-usage: loopback usage RPC");
}
//#endregion
export { apply, createRpcHandler, inject, name };
