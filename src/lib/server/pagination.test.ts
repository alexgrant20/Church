import { describe, expect, it } from 'vitest';
import { ValidationError } from './errors';
import { encodeCursor, parsePage } from './pagination';

const page = (qs: string) => parsePage(new URL(`http://x/api?${qs}`));

describe('pagination', () => {
	it('defaults to 50', () => {
		expect(page('')).toEqual({ cursor: null, limit: 50 });
	});

	it('clamps limit to 100', () => {
		expect(page('limit=500').limit).toBe(100);
		expect(page('limit=0').limit).toBe(1);
		expect(page('limit=abc').limit).toBe(50);
	});

	it('rejects a malformed cursor with error_bad_cursor', () => {
		expect(() => page('cursor=@@@')).toThrow(new ValidationError('error_bad_cursor'));
		const notJson = Buffer.from('nope').toString('base64url');
		expect(() => page(`cursor=${notJson}`)).toThrow('error_bad_cursor');
		const wrongShape = Buffer.from('{"key":1}').toString('base64url');
		expect(() => page(`cursor=${wrongShape}`)).toThrow('error_bad_cursor');
	});

	it('round-trips a cursor', () => {
		const c = encodeCursor('Jakarta Selatan', 'abc');
		expect(page(`cursor=${c}`).cursor).toEqual({ key: 'Jakarta Selatan', id: 'abc' });
	});
});
