import { computeSegments } from './segments';

const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return (error as { getResponse(): { code: string } }).getResponse().code;
  }
  return undefined;
};

describe('computeSegments', () => {
  it.each([
    [1, 1],
    [160, 1],
    [161, 2],
    [960, 6],
  ])('ASCII text of %i chars uses %i segment(s)', (length, segments) => {
    expect(computeSegments('a'.repeat(length))).toEqual({
      isUnicode: false,
      length,
      segments,
    });
  });

  it.each([
    [70, 1],
    [71, 2],
    [420, 6],
  ])('unicode text of %i chars uses %i segment(s)', (length, segments) => {
    expect(computeSegments('é'.repeat(length))).toEqual({
      isUnicode: true,
      length,
      segments,
    });
  });

  it('counts an emoji as one character', () => {
    expect(computeSegments('😀'.repeat(70))).toEqual({
      isUnicode: true,
      length: 70,
      segments: 1,
    });
  });

  it('rejects more than 6 segments', () => {
    expect(codeOf(() => computeSegments('a'.repeat(961)))).toBe('TEXT_TOO_LONG');
    expect(codeOf(() => computeSegments('é'.repeat(421)))).toBe('TEXT_TOO_LONG');
  });

  it('rejects an empty text', () => {
    expect(codeOf(() => computeSegments(''))).toBe('VALIDATION_ERROR');
  });
});
