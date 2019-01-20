import { Server, ServerResponse } from "http";
import { Stream } from "stream";

import { readable } from "is-stream";

import { Exception } from "./error";
import { Body, HttpRequest, HttpResponse, res } from "./http-message";

export type HttpHandler = (
	req: HttpRequest
) => Promise<HttpResponse> | HttpResponse | Body | Promise<Body>;

const { NODE_ENV } = process.env;
const DEV = NODE_ENV === "development";

function isHttpResponse(obj: any): obj is HttpResponse {
	return obj instanceof HttpResponse;
}

export function micro(fn: HttpHandler) {
	return new Server((req, resp) => run(req, resp, fn));
}

async function run(req: HttpRequest, resp: ServerResponse, fn: HttpHandler) {
	try {
		const result = await fn(req);

		let response: HttpResponse = isHttpResponse(result)
			? result
			: res(result);

		const body = response.getBody();
		if (body === null || body === undefined) {
			response = response.setStatus(204);
		}
		if (!response.getStatus()) {
			response = response.setStatus(200);
		}

		send(response, resp);
	} catch (error) {
		send(createErrorResponse(error), resp);
	}
}

function isStream(obj: any): obj is Stream {
	return obj instanceof Stream;
}

function createErrorResponse(errorObj: Exception): HttpResponse {
	const message = "Internal Server Error";
	if (errorObj instanceof Error) {
		console.error(errorObj.stack);
	} else {
		console.warn("thrown error must be an instance Error");
	}
	return res(DEV ? errorObj.stack : message, 500);
}

function send(source: HttpResponse, resp: ServerResponse) {
	resp.statusCode = source.getStatus();
	Object
		.entries(source.getHeaders())
		.forEach(header => {
			resp.setHeader(header[0], header[1] || "");
		});
	const body = source.getBody();
	if (body === null || body === undefined) {
		resp.end();
		return;
	}

	if (Buffer.isBuffer(body)) {
		if (!resp.getHeader("Content-Type")) {
			resp.setHeader("Content-Type", "application/octet-stream");
		}

		resp.setHeader("Content-Length", body.length);
		resp.end(body);
		return;
	}

	if (isStream(body) || readable(body)) {
		if (!resp.getHeader("Content-Type")) {
			resp.setHeader("Content-Type", "application/octet-stream");
		}

		body.pipe(resp);
		return;
	}

	let str: string;

	if (typeof body === "object" || typeof body === "number") {
		// We stringify before setting the header
		// in case `JSON.stringify` throws and a
		// 500 has to be sent instead

		// the `JSON.stringify` call is split into
		// two cases as `JSON.stringify` is optimized
		// in V8 if called with only one argument
		if (DEV) {
			str = JSON.stringify(body, null, 2);
		} else {
			str = JSON.stringify(body);
		}

		if (!resp.getHeader("Content-Type")) {
			resp.setHeader("Content-Type", "application/json; charset=utf-8");
		}
	} else {
		str = body;
	}

	resp.setHeader("Content-Length", Buffer.byteLength(str));
	resp.end(str);
}