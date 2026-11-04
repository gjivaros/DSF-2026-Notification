import { Errors } from './errors';

const ASCII_CHARS_PER_SEGMENT = 160;
const UNICODE_CHARS_PER_SEGMENT = 70;
export const MAX_SEGMENTS = 6;

export interface SegmentInfo {
  isUnicode: boolean;
  length: number;
  segments: number;
}

export function computeSegments(text: string): SegmentInfo {
  if (text.length === 0) throw Errors.validation('text must not be empty');
  const isUnicode = !/^[\x00-\x7F]*$/.test(text);
  // Count code points so that an emoji counts as one character
  const length = Array.from(text).length;
  const perSegment = isUnicode
    ? UNICODE_CHARS_PER_SEGMENT
    : ASCII_CHARS_PER_SEGMENT;
  const segments = Math.ceil(length / perSegment);
  if (segments > MAX_SEGMENTS) throw Errors.textTooLong();
  return { isUnicode, length, segments };
}
