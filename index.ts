import { createToken, CstParser, Lexer, CstNode, IToken } from 'chevrotain';

export enum FilterType {
  Term = 1,
  Field,
  GT,
  GTE,
  LT,
  LTE,
  Range,
}

export interface TermFilter {
  type: FilterType.Term;
  kind: 'Term';
  value: string;
}

export interface FieldFilter {
  type: FilterType.Field;
  kind: 'Field';
  field: string;
  value: string;
}

export interface CompareFilter {
  type: FilterType.GT | FilterType.GTE | FilterType.LT | FilterType.LTE;
  kind: 'EQ' | 'GT' | 'GTE' | 'LT' | 'LTE';
  field: string;
  value: number | Date;
}

export interface RangeFilter {
  type: FilterType.Range;
  kind: 'Range';
  field: string;
  from: number | Date;
  to: number | Date;
}

const SP = createToken({
  name: 'SP',
  pattern: /\s+/,
  group: Lexer.SKIPPED,
});

const Term = createToken({
  name: 'Term',
  pattern: /(?:[^\\\s:\.]|\\[\s:\.])+/,
});

const TermEscapeRegExp = /\\(.)/g;

const escapeTerm = (text: string) => text.replace(TermEscapeRegExp, '$1');

const Not = createToken({
  name: 'Not',
  pattern: /NOT/,
  longer_alt: Term,
});

const Minus = createToken({
  name: 'Minus',
  pattern: /-/,
});

const ID = createToken({
  name: 'ID',
  pattern: /[a-zA-Z_]+[a-zA-Z0-9_]*/,
  longer_alt: Term,
});

const EQ = createToken({
  name: 'EQ',
  pattern: /:/,
});

const GT = createToken({
  name: 'GT',
  pattern: /:>/,
});

const GTE = createToken({
  name: 'GTE',
  pattern: /:>=/,
});

const LT = createToken({
  name: 'LT',
  pattern: /:</,
});

const LTE = createToken({
  name: 'LTE',
  pattern: /:<=/,
});

const DateLiteral = createToken({
  name: 'DateLiteral',
  pattern: /\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:Z|\+\d{2}:\d{2}))?/,
  longer_alt: Term,
});

const NumberLiteral = createToken({
  name: 'NumberLiteral',
  pattern: /\d+(?:\.\d+)?/,
  longer_alt: Term,
});

const DoubleDot = createToken({
  name: 'DoubleDot',
  pattern: /\.\./,
});

const Star = createToken({
  name: 'Star',
  pattern: /\*/,
});

const QuotedTerm = createToken({
  name: 'QuotedTerm',
  pattern: /"([^"\\]|\\")*"/,
});

const tokens = [
  SP,
  Not,
  Minus,
  ID,
  GTE,
  GT,
  LTE,
  LT,
  EQ,
  DoubleDot,
  Star,
  DateLiteral,
  NumberLiteral,
  QuotedTerm,
  Term,
];

class Parser extends CstParser {
  constructor() {
    super(tokens, { recoveryEnabled: true });
    this.performSelfAnalysis();
  }

  statements = this.RULE('statements', () => {
    this.MANY(() => {
      this.SUBRULE(this.statement);
    });
  });

  statement = this.RULE('statement', () => {
    this.OR([
      { ALT: () => this.SUBRULE(this.negativeStatement) },
      { ALT: () => this.SUBRULE(this.fieldStatement) },
      { ALT: () => this.SUBRULE(this.compareStatement) },
      { ALT: () => this.SUBRULE(this.term) },
    ]);
  });

  negativeStatement = this.RULE('negativeStatement', () => {
    this.OR([
      { ALT: () => this.CONSUME(Not) },
      { ALT: () => this.CONSUME(Minus) },
    ]);
    this.SUBRULE(this.statement);
  });

  fieldStatement = this.RULE('fieldStatement', () => {
    this.SUBRULE(this.identifier);
    this.CONSUME(EQ);
    this.OR([
      { ALT: () => this.SUBRULE(this.range) },
      { ALT: () => this.SUBRULE(this.term) },
    ]);
  });

  compareStatement = this.RULE('compareStatement', () => {
    this.SUBRULE(this.identifier);
    this.OR([
      { ALT: () => this.CONSUME(GT) },
      { ALT: () => this.CONSUME(GTE) },
      { ALT: () => this.CONSUME(LT) },
      { ALT: () => this.CONSUME(LTE) },
    ]);
    this.SUBRULE(this.comparable);
  });

  identifier = this.RULE('identifier', () => {
    this.CONSUME(ID);
  });

  range = this.RULE('range', () => {
    this.OR([
      { ALT: () => this.SUBRULE(this.rangeLeft) },
      { ALT: () => this.SUBRULE(this.rangeRight) },
    ]);
  });

  rangeLeft = this.RULE('rangeLeft', () => {
    this.SUBRULE(this.comparable);
    this.CONSUME(DoubleDot);
    this.OR([
      { ALT: () => this.CONSUME(Star) },
      { ALT: () => this.SUBRULE2(this.comparable) },
    ]);
  });

  rangeRight = this.RULE('rangeRight', () => {
    this.CONSUME(Star);
    this.CONSUME(DoubleDot);
    this.SUBRULE(this.comparable);
  });

  comparable = this.RULE('comparable', () => {
    this.OR([
      { ALT: () => this.CONSUME(NumberLiteral) },
      { ALT: () => this.CONSUME(DateLiteral) },
    ]);
  });

  term = this.RULE('term', () => {
    this.OR([
      { ALT: () => this.SUBRULE(this.identifier) },
      { ALT: () => this.CONSUME(DateLiteral) },
      { ALT: () => this.CONSUME(NumberLiteral) },
      { ALT: () => this.CONSUME(Term) },
      { ALT: () => this.CONSUME(QuotedTerm) },
    ]);
  });
}

const lexer = new Lexer(tokens);

const parser = new Parser();

class Visitor extends parser.getBaseCstVisitorConstructor() {
  constructor() {
    super();
    this.validateVisitor();
  }

  statements(ctx: { statement?: CstNode[] }) {
    if (ctx.statement) {
      return ctx.statement.map((c) => this.visit(c));
    }
    return [];
  }

  statement(ctx: {
    negativeStatement?: [CstNode];
    fieldStatement?: [CstNode];
    compareStatement?: [CstNode];
    term?: [CstNode];
  }) {
    if (ctx.negativeStatement) {
      return this.visit(ctx.negativeStatement);
    }
    if (ctx.fieldStatement) {
      return this.visit(ctx.fieldStatement);
    }
    if (ctx.compareStatement) {
      return this.visit(ctx.compareStatement);
    }
    if (ctx.term) {
      return {
        type: FilterType.Term,
        kind: 'Term',
        value: this.visit(ctx.term),
      };
    }
  }

  negativeStatement(ctx: { statement: [CstNode] }) {
    const node = this.visit(ctx.statement);
    if (node.exclude) {
      delete node.exclude;
    } else {
      node.exclude = true;
    }
    return node;
  }

  fieldStatement(ctx: {
    identifier: [CstNode];
    range?: [CstNode];
    term?: [CstNode];
  }) {
    const field = this.visit(ctx.identifier);
    if (ctx.range) {
      const { from, to } = this.visit(ctx.range);
      if (!from) {
        return {
          type: FilterType.LTE,
          kind: 'LTE',
          field,
          value: to,
        };
      }
      if (!to) {
        return {
          type: FilterType.GTE,
          kind: 'GTE',
          field,
          value: from,
        };
      }
      return {
        type: FilterType.Range,
        kind: 'Range',
        field,
        from,
        to,
      };
    }
    return {
      type: FilterType.Field,
      kind: 'Field',
      field,
      value: this.visit(ctx.term),
    };
  }

  compareStatement(ctx: {
    identifier: [CstNode];
    GT?: [IToken];
    GTE?: [IToken];
    LT?: [IToken];
    LTE?: [IToken];
    comparable: [CstNode];
  }) {
    const node: CompareFilter = {
      type: FilterType.GT,
      kind: 'GT',
      field: this.visit(ctx.identifier),
      value: this.visit(ctx.comparable),
    };

    if (ctx.GT) {
      node.type = FilterType.GT;
      node.kind = 'GT';
    } else if (ctx.GTE) {
      node.type = FilterType.GTE;
      node.kind = 'GTE';
    } else if (ctx.LT) {
      node.type = FilterType.LT;
      node.kind = 'LT';
    } else if (ctx.LTE) {
      node.type = FilterType.LTE;
      node.kind = 'LTE';
    }

    return node;
  }

  identifier(ctx: { ID: [IToken] }) {
    return ctx.ID[0].image;
  }

  range(ctx: { rangeLeft?: [CstNode]; rangeRight?: [CstNode] }) {
    if (ctx.rangeLeft) {
      return this.visit(ctx.rangeLeft);
    }
    return this.visit(ctx.rangeRight);
  }

  rangeLeft(ctx: { comparable: [CstNode] | [CstNode, CstNode] }) {
    return {
      from: this.visit(ctx.comparable[0]),
      to:
        ctx.comparable[1] !== undefined
          ? this.visit(ctx.comparable[1])
          : undefined,
    };
  }

  rangeRight(ctx: { comparable: [CstNode] }) {
    return {
      to: this.visit(ctx.comparable[0]),
    };
  }

  comparable(ctx: { NumberLiteral?: [IToken]; DateLiteral?: [IToken] }) {
    if (ctx.NumberLiteral) {
      return Number(ctx.NumberLiteral[0].image);
    }
    if (ctx.DateLiteral) {
      return new Date(ctx.DateLiteral[0].image);
    }
  }

  term(ctx: {
    identifier?: [CstNode];
    NumberLiteral?: [IToken];
    DateLiteral?: [IToken];
    Term?: [IToken];
    QuotedTerm?: [IToken];
  }) {
    if (ctx.identifier) {
      return this.visit(ctx.identifier);
    }
    if (ctx.NumberLiteral) {
      return ctx.NumberLiteral[0].image;
    }
    if (ctx.DateLiteral) {
      return ctx.DateLiteral[0].image;
    }
    if (ctx.Term) {
      return escapeTerm(ctx.Term[0].image);
    }
    if (ctx.QuotedTerm) {
      return JSON.parse(ctx.QuotedTerm[0].image);
    }
  }
}

const visitor = new Visitor();

export function parse(
  filter: string
): (TermFilter | CompareFilter | RangeFilter)[] {
  const { tokens } = lexer.tokenize(filter);
  parser.input = tokens;
  const cst = parser.statements();
  return visitor.visit(cst);
}
