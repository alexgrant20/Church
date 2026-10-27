import { describe, expect, it } from 'vitest';
import { ValidationError } from './errors';
import { encodeCursor, isTimestampKey, parsePage } from './pagination';

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

	it('rejects a non-UUID id and a non-date key where a date is required', () => {
		const badId = encodeCursor('Jakarta', 'not-a-uuid');
		expect(() => page(`cursor=${badId}`)).toThrow('error_bad_cursor');
		const id = '01a17c81-313c-7a1a-bf9a-2c1353206e19';
		const badKey = encodeCursor('yesterday', id);
		const parse = () => parsePage(new URL(`http://x/api?cursor=${badKey}`), isTimestampKey);
		expect(parse).toThrow('error_bad_cursor');
		const good = encodeCursor('2026-01-01 10:00:00.123456+00', id);
		expect(parsePage(new URL(`http://x/api?cursor=${good}`), isTimestampKey).cursor?.id).toBe(id);
	});

	it('round-trips a cursor', () => {
		const c = encodeCursor('Jakarta Selatan', '01a17c81-313c-7a1a-bf9a-2c1353206e19');
		expect(page(`cursor=${c}`).cursor).toEqual({
			key: 'Jakarta Selatan',
			id: '01a17c81-313c-7a1a-bf9a-2c1353206e19'
		});
	});
});
