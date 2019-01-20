import contentType from "content-type";
import getRawBody from "raw-body";

import { createError } from "./error";
import { HttpRequest } from "./http-message";

// Maps requests to buffered raw bodies so that
// multiple calls to `json` work as expected
const rawBodyMap = new WeakMap<HttpRequest, Buffer>();

export async function buffer(
	req: HttpRequest,
	{ limit = "1mb" }: { limit?: number | string | null } = {}
): Promise<Buffer> {
	const length = req.headers["content-length"];

	const body = rawBodyMap.get(req);

	if (body) {
		return body;
	}

	return getRawBody(req, {
		limit,
		length
	})
		.then((buf: Buffer) => {
			rawBodyMap.set(req, buf);
			return buf;
		})
		.catch(err => {
			if (err.type === "entity.too.large") {
				throw createError(`Body exceeded ${limit} limit`, err);
			} else {
				throw createError("Invalid body", err);
			}
		});
}

export async function text(
	req: HttpRequest,
	{
		limit,
		encoding
	}: { limit?: string | number | null; encoding?: string } = {}
): Promise<string> {
	const type = req.headers["content-type"] || "text/plain; charset=utf-8";
	if (encoding) {
		encoding = contentType.parse(type).parameters.charset;
	}
	return (await buffer(req, { limit })).toString(encoding);
}

function parseJSON(str: string) {
	try {
		return JSON.parse(str);
	} catch (err) {
		throw createError("Invalid JSON", err);
	}
}

export async function json(
	req: HttpRequest,
	opts: { limit?: string | number | null; encoding?: string } = {}
) {
	return parseJSON(await text(req, opts));
}