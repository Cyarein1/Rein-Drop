import { describe, expect, it } from 'vitest';
import type { SellerSnapshot } from '@rein-drop/contracts';
import {
  buildStepUpdate,
  dealCriterionOptions,
  dealTargetField,
  hasAnswer,
  huntFormContext,
  nextStep,
  previousStep,
  questionNumber,
  questionOptions,
  resumeStep,
  SELLER_SNAPSHOT_COPY,
  SNAPSHOT_GATE_COPY,
  snapshotAnswerRows,
  snapshotDraft,
  snapshotGateCopy,
  snapshotQuestionText,
  snapshotSummary,
} from './index.js';

const ZA = huntFormContext({ countryCode: 'ZA', currency: 'ZAR', distanceUnit: 'km', language: 'en', source: 'detected' } as never);
const US = huntFormContext({ countryCode: 'US', currency: 'USD', distanceUnit: 'mi', language: 'en', source: 'detected' } as never);

const empty: SellerSnapshot = {
  isReseller: null,
  status: 'not_started',
  categories: [],
  categoriesOther: null,
  stage: null,
  sources: [],
  sourcesOther: null,
  dealRule: null,
  improvementGoal: null,
  completedAt: null,
  updatedAt: null,
};
const complete: SellerSnapshot = {
  ...empty,
  isReseller: true,
  status: 'complete',
  categories: ['phones_tablets'],
  stage: 'side_income',
  sources: ['facebook_marketplace', 'ebay'],
  dealRule: { criterion: 'min_profit', target: { amountMinor: 150_000, currency: 'ZAR' } },
  improvementGoal: 'stop_checking_marketplaces',
  completedAt: '2026-10-07T12:00:00.000Z',
};

describe('step order and resuming', () => {
  it('starts at the gate, then asks five questions, then summarises', () => {
    expect(resumeStep(empty)).toBe('gate');
    const order = ['gate'] as string[];
    let step = nextStep('gate');
    while (step !== 'summary') {
      order.push(step);
      step = nextStep(step as never);
    }
    expect(order).toEqual(['gate', 'categories', 'stage', 'sources', 'dealRule', 'improvementGoal']);
    expect(previousStep('categories')).toBe('gate');
    expect(previousStep('dealRule')).toBe('sources');
    expect([questionNumber('categories'), questionNumber('improvementGoal'), questionNumber('gate')]).toEqual([1, 5, null]);
  });

  it('resumes at the first unanswered question after a refresh', () => {
    expect(resumeStep({ ...empty, isReseller: true, status: 'in_progress', categories: ['gaming'], stage: 'full_time' })).toBe('sources');
    expect(resumeStep({ ...empty, isReseller: true, status: 'in_progress' })).toBe('categories');
    expect(resumeStep(complete)).toBe('summary');
    expect(resumeStep({ ...empty, isReseller: false, status: 'not_reseller' })).toBe('not_reseller');
  });
});

describe('answers and validation', () => {
  it('needs a meaningful answer before Next', () => {
    const draft = snapshotDraft(null);
    expect(hasAnswer('categories', draft)).toBe(false);
    expect(buildStepUpdate('categories', draft, ZA)).toEqual({ ok: false, error: 'Choose at least one' });
    expect(buildStepUpdate('stage', draft, ZA)).toEqual({ ok: false, error: 'Choose one' });
    expect(hasAnswer('categories', { ...draft, categories: ['tools'] })).toBe(true);
  });

  it('keeps "Other" text only with the Other option', () => {
    const draft = { ...snapshotDraft(null), categories: ['tools' as const], categoriesOther: 'Vinyl' };
    expect(buildStepUpdate('categories', draft, ZA)).toEqual({ ok: true, update: { categories: ['tools'], categoriesOther: null } });
    expect(buildStepUpdate('categories', { ...draft, categories: ['tools', 'other'] }, ZA)).toEqual({
      ok: true,
      update: { categories: ['tools', 'other'], categoriesOther: 'Vinyl' },
    });
    expect(buildStepUpdate('sources', { ...draft, sources: ['other'], sourcesOther: 'x'.repeat(61) }, ZA).ok).toBe(false);
  });

  it('takes the optional deal target in the user currency, or a whole percent', () => {
    const draft = { ...snapshotDraft(null), dealCriterion: 'min_profit' as const, dealTarget: '1 500' };
    expect(buildStepUpdate('dealRule', draft, ZA)).toEqual({
      ok: true,
      update: { dealRule: { criterion: 'min_profit', target: { amountMinor: 150_000, currency: 'ZAR' } } },
    });
    expect(buildStepUpdate('dealRule', { ...draft, dealTarget: '' }, ZA)).toEqual({
      ok: true,
      update: { dealRule: { criterion: 'min_profit', target: null } },
    });
    expect(buildStepUpdate('dealRule', { ...draft, dealTarget: 'lots' }, ZA).ok).toBe(false);
    expect(buildStepUpdate('dealRule', { ...draft, dealTarget: '0' }, ZA).ok).toBe(false);
    expect(buildStepUpdate('dealRule', { ...draft, dealCriterion: 'min_margin', dealTarget: '25%' }, ZA)).toEqual({
      ok: true,
      update: { dealRule: { criterion: 'min_margin', targetPercent: 25 } },
    });
    expect(buildStepUpdate('dealRule', { ...draft, dealCriterion: 'min_margin', dealTarget: '150' }, ZA).ok).toBe(false);
    expect(buildStepUpdate('dealRule', { ...draft, dealCriterion: 'case_by_case', dealTarget: '99' }, ZA)).toEqual({
      ok: true,
      update: { dealRule: { criterion: 'case_by_case' } },
    });
  });

  it('round-trips saved answers back into the draft', () => {
    expect(snapshotDraft(complete)).toMatchObject({ categories: ['phones_tablets'], dealCriterion: 'min_profit', dealTarget: '1500.00' });
    expect(snapshotDraft({ ...complete, dealRule: { criterion: 'min_margin', targetPercent: 30 } }).dealTarget).toBe('30');
  });

  it('labels question 4 in the user currency, not a hard-coded "$"', () => {
    expect(dealCriterionOptions(ZA)[0]).toEqual({ value: 'min_profit', label: 'Minimum R profit' });
    expect(dealCriterionOptions(US)[0]!.label).toBe('Minimum $ profit');
    expect(dealTargetField('max_buy_price', ZA)).toEqual({ kind: 'money', label: 'Usual max buy price (ZAR, optional)' });
    expect(dealTargetField('fast_resale', ZA)).toBeNull();
  });
});

describe('summary', () => {
  it('echoes the answers and lists only what they really change', () => {
    const { sentence, priorities } = snapshotSummary(complete, ZA);
    expect(sentence).toMatch(
      /^Got it\. You hunt for phones & tablets, source on Facebook Marketplace and eBay, care most about R\s?1\s?500,00\+ profit, and want to stop checking marketplaces all day\. Let's build your first Hunt\.$/,
    );
    expect(priorities[0]).toBe('Hunt ideas for phones & tablets');
    expect(priorities[1]).toBe('Facebook Marketplace and eBay as your starting marketplaces');
    expect(priorities[2]).toMatch(/^Deals with at least R\s?1\s?500,00 profit$/);
  });

  it('is honest when no supported marketplace or fixed threshold was chosen', () => {
    const { sentence, priorities } = snapshotSummary(
      { ...complete, sources: ['thrift_retail', 'other'], sourcesOther: 'garage sales', categories: ['other'], categoriesOther: null, dealRule: { criterion: 'case_by_case' } },
      ZA,
    );
    expect(sentence).toContain('You hunt for other items, source on thrift/retail and garage sales, decide case by case');
    expect(priorities.slice(1)).toEqual([
      'eBay and Facebook Marketplace - the marketplaces Rein Drop covers today',
      'Your call on each deal - no fixed money threshold',
    ]);
  });

  it('lists the answers for Settings', () => {
    const rows = snapshotAnswerRows(complete, ZA);
    expect(rows.map((r) => r.question)).toHaveLength(5);
    expect(rows[3]!.answer).toMatch(/^Minimum R profit: R\s?1\s?500,00$/);
    expect(snapshotAnswerRows({ ...empty, isReseller: true, status: 'in_progress' }, ZA)[1]!.answer).toBe('Not answered');
  });
});

describe('German (draft)', () => {
  const DE = huntFormContext({ countryCode: 'DE', currency: 'EUR', distanceUnit: 'km', language: 'de', source: 'detected' } as never);
  const nb = (s: string) => s.replace(/\s/g, ' ');

  it('questions, options and validation', () => {
    expect(DE.language).toBe('de');
    expect(snapshotQuestionText('categories', DE.t)).toBe('Wonach suchst du normalerweise?');
    expect(questionOptions('stage', DE.t)[0]).toEqual({ value: 'getting_started', label: 'Ich fange gerade an' });
    expect(questionOptions('stage')[0]).toEqual({ value: 'getting_started', label: SELLER_SNAPSHOT_COPY.stage.options.getting_started });
    expect(dealCriterionOptions(DE)[0]).toEqual({ value: 'min_profit', label: 'Mindestgewinn in €' });
    expect(dealTargetField('min_profit', DE)!.label).toBe('Mindestgewinn pro Deal (EUR, optional)');
    expect(buildStepUpdate('categories', snapshotDraft(null), DE)).toEqual({ ok: false, error: 'Wähle mindestens eine Option' });
    expect(snapshotGateCopy(DE.t).question).toBe('Bist du Wiederverkäufer?');
    // English accessors match the English constants the apps use today.
    expect(snapshotGateCopy(ZA.t)).toEqual(SNAPSHOT_GATE_COPY);
  });

  it('summary in one sentence, estimates not called profit', () => {
    const eur = { ...complete, dealRule: { criterion: 'min_profit' as const, target: { amountMinor: 15_000, currency: 'EUR' } } };
    const { sentence, priorities } = snapshotSummary(eur, DE);
    expect(nb(sentence)).toBe(
      'Alles klar. Du suchst nach Handys & Tablets, kaufst über Facebook Marketplace und eBay ein, willst mindestens 150,00 € pro Deal verdienen und willst nicht mehr den ganzen Tag Marktplätze checken. Lass uns deinen ersten Hunt erstellen.',
    );
    expect(priorities[1]).toBe('Facebook Marketplace und eBay als deine Start-Marktplätze');
    expect(nb(priorities[2]!)).toBe('Deals mit mindestens 150,00 € geschätztem Potenzial');
    expect(snapshotSummary({ ...complete, improvementGoal: null, dealRule: { criterion: 'case_by_case' } }, DE).sentence).toMatch(/entscheidest von Fall zu Fall\. Lass uns/);
    expect(snapshotAnswerRows({ ...complete, dealRule: { criterion: 'min_margin', targetPercent: 30 } }, DE)[3]!.answer).toBe('Mindestmarge in %: 30 %');
  });
});
