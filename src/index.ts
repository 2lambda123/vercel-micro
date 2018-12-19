// Native
import { Server, IncomingMessage, ServerResponse } from "http";
import { Stream } from "stream";

// Packages
import contentType from "content-type";
import getRawBody from "raw-body";
import { readable } from "is-stream";

import { HttpError } from "./error";

const { NODE_ENV } = process.env;
const DEV = NODE_ENV === "development";

export type ResponseObject = null | Buffer | Stream | object | number | string;

export type RequestHandler = (
	req: IncomingMessage,
	res: ServerResponse
) => ResponseObject | Promise<ResponseObject> | undefined;

export const serve = (fn: RequestHandler) =>
	new Server((req, res) => run(req, res, fn)); // TODO: We should create an issue in DefinitelyTypes: `Server` can be called without new

export default serve;

export const createError = (code: number, message: string, original: Error) =>
	new HttpError(code, message, original);

export const send = (
	res: ServerResponse,
	code: number,
	obj: ResponseObject = null
) => {
	res.statusCode = code;

	if (obj === null) {
		res.end();
		return;
	}

	if (Buffer.isBuffer(obj)) {
		if (!res.getHeader("Content-Type")) {
			res.setHeader("Content-Type", "application/octet-stream");
		}

		res.setHeader("Content-Length", obj.length);
		res.end(obj);
		return;
	}

	if (obj instanceof Stream || readable(obj)) {
		if (!res.getHeader("Content-Type")) {
			res.setHeader("Content-Type", "application/octet-stream");
		}

		obj.pipe(res);
		return;
	}

	let str = obj;

	if (typeof obj === "object" || typeof obj === "number") {
		// We stringify before setting the header
		// in case `JSON.stringify` throws and a
		// 500 has to be sent instead

		// the `JSON.stringify` call is split into
		// two cases as `JSON.stringify` is optimized
		// in V8 if called with only one argument
		if (DEV) {
			str = JSON.stringify(obj, null, 2);
		} else {
			str = JSON.stringify(obj);
		}

		if (!res.getHeader("Content-Type")) {
			res.setHeader("Content-Type", "application/json; charset=utf-8");
		}
	}

	res.setHeader("Content-Length", Buffer.byteLength(str as any)); // TODO: Just to make compiler happy
	res.end(str);
};

export const sendError = (
	req: IncomingMessage,
	res: ServerResponse,
	errorObj: HttpError & { status: number } // TODO: This is wrong! Just to make compiler happy
) => {
	const statusCode = errorObj.statusCode || errorObj.status;
	const message = statusCode ? errorObj.message : "Internal Server Error";
	send(res, statusCode || 500, DEV ? errorObj.stack : message);
	if (errorObj instanceof Error) {
		console.error(errorObj.stack);
	} else {
		console.warn("thrown error must be an instance Error");
	}
};

export const run = (
	req: IncomingMessage,
	res: ServerResponse,
	fn: RequestHandler
) =>
	new Promise(resolve => resolve(fn(req, res)))
		.then((val: ResponseObject | undefined) => {
			if (val === null) {
				send(res, 204, null);
				return;
			}

			// Send value if it is not undefined, otherwise assume res.end
			// will be called later
			// eslint-disable-next-line no-undefined
			if (val !== undefined) {
				send(res, res.statusCode || 200, val);
			}
		})
		.catch(err => sendError(req, res, err));

// Maps requests to buffered raw bodies so that
// multiple calls to `json` work as expected
const rawBodyMap = new WeakMap<IncomingMessage, string | Buffer>();

const parseJSON = (str: string) => {
	try {
		return JSON.parse(str);
	} catch (err) {
		throw createError(400, "Invalid JSON", err);
	}
};

export const buffer = (
	req: IncomingMessage,
	{ limit = "1mb", encoding }: { limit?: string; encoding?: string } = {} // TODO: fix the typing of encoding. Fixing this should let us remove the type information in line 155
) =>
	Promise.resolve().then(() => {
		const type = req.headers["content-type"] || "text/plain";
		const length = req.headers["content-length"];

		// eslint-disable-next-line no-undefined
		if (encoding === undefined) {
			encoding = contentType.parse(type).parameters.charset;
		}

		const body = rawBodyMap.get(req);

		if (body) {
			return body;
		}

		return getRawBody(req, { limit, length, encoding })
			.then((buf: string | Buffer) => {
				rawBodyMap.set(req, buf);
				return buf;
			})
			.catch(err => {
				if (err.type === "entity.too.large") {
					throw createError(413, `Body exceeded ${limit} limit`, err);
				} else {
					throw createError(400, "Invalid body", err);
				}
			});
	});

export const text = (
	req: IncomingMessage,
	{ limit, encoding }: { limit?: string; encoding?: string } = {}
) => buffer(req, { limit, encoding }).then(body => body.toString(encoding));

export const json = (
	req: IncomingMessage,
	opts: { limit?: string; encoding?: string }
) => text(req, opts).then(body => parseJSON(body));
