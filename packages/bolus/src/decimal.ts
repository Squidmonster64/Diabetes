/**
 * Exact rational decimal arithmetic for clinical calculations.
 *
 * Preserved from the Stage 5 reference implementation
 * (vendor/bolus-calculator-handoff/BOLUS_CALCULATOR_HANDOFF.zip,
 * reference-implementation/src/decimal.ts). Do not switch to JavaScript
 * `number`, `parseFloat()` or `Math.round()` for clinical arithmetic -
 * see BOLUS_CALCULATOR_IMPLEMENTATION_HANDOFF.md section 4.
 */
export class Decimal {
  readonly numerator: bigint;
  readonly denominator: bigint;

  private constructor(numerator: bigint, denominator: bigint) {
    if (denominator === 0n) throw new Error("Division by zero");
    const sign = denominator < 0n ? -1n : 1n;
    const gcd = greatestCommonDivisor(abs(numerator), abs(denominator));
    this.numerator = (numerator * sign) / gcd;
    this.denominator = (denominator * sign) / gcd;
  }

  static parse(value: string): Decimal {
    if (typeof value !== "string" || value.length === 0 || value.length > 32) {
      throw new Error("Invalid decimal string");
    }
    if (!/^[+-]?(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(value)) {
      throw new Error("Invalid decimal format");
    }
    const negative = value.startsWith("-");
    const unsigned = value.replace(/^[+-]/, "");
    const [whole = "0", fraction = ""] = unsigned.split(".");
    const denominator = 10n ** BigInt(fraction.length);
    const numerator = BigInt(whole + fraction) * (negative ? -1n : 1n);
    return new Decimal(numerator, denominator);
  }

  static fromInteger(value: bigint): Decimal {
    return new Decimal(value, 1n);
  }

  add(other: Decimal): Decimal {
    return new Decimal(
      this.numerator * other.denominator + other.numerator * this.denominator,
      this.denominator * other.denominator,
    );
  }

  subtract(other: Decimal): Decimal {
    return new Decimal(
      this.numerator * other.denominator - other.numerator * this.denominator,
      this.denominator * other.denominator,
    );
  }

  multiply(other: Decimal): Decimal {
    return new Decimal(this.numerator * other.numerator, this.denominator * other.denominator);
  }

  divide(other: Decimal): Decimal {
    if (other.numerator === 0n) throw new Error("Division by zero");
    return new Decimal(this.numerator * other.denominator, this.denominator * other.numerator);
  }

  compare(other: Decimal): number {
    const difference = this.numerator * other.denominator - other.numerator * this.denominator;
    return difference < 0n ? -1 : difference > 0n ? 1 : 0;
  }

  max(other: Decimal): Decimal {
    return this.compare(other) >= 0 ? this : other;
  }

  /** Round a non-negative value to nearest increment, ties away from zero (round-half-up). */
  roundHalfUpToIncrement(increment: Decimal): Decimal {
    if (this.compare(Decimal.fromInteger(0n)) < 0) throw new Error("Cannot round negative dose");
    if (increment.compare(Decimal.fromInteger(0n)) <= 0) throw new Error("Invalid increment");
    const quotient = this.divide(increment);
    const whole = quotient.numerator / quotient.denominator;
    const remainder = quotient.numerator % quotient.denominator;
    const roundedWhole = remainder * 2n >= quotient.denominator ? whole + 1n : whole;
    return Decimal.fromInteger(roundedWhole).multiply(increment);
  }

  isInteger(): boolean {
    return this.numerator % this.denominator === 0n;
  }

  toCanonicalString(maxScale = 12): string {
    const negative = this.numerator < 0n;
    const numerator = abs(this.numerator);
    const whole = numerator / this.denominator;
    let remainder = numerator % this.denominator;
    if (remainder === 0n) return `${negative ? "-" : ""}${whole}`;

    let fraction = "";
    for (let index = 0; index < maxScale && remainder !== 0n; index += 1) {
      remainder *= 10n;
      fraction += (remainder / this.denominator).toString();
      remainder %= this.denominator;
    }
    fraction = fraction.replace(/0+$/, "");
    return `${negative ? "-" : ""}${whole}.${fraction}`;
  }
}

function abs(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function greatestCommonDivisor(a: bigint, b: bigint): bigint {
  while (b !== 0n) [a, b] = [b, a % b];
  return a === 0n ? 1n : a;
}
