export interface DailyClosingInput {
  openingCash: number;
  actualCash: number;
  tillExpenses: number;
  fundExpenses: number;
  otherExpenses?: number;
  openingFund: number;
}

export interface DailyClosingResult {
  rossat: number;
  transferredToFund: number;
  totalExpenses: number;
  net: number;
  fundBalance: number;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateDailyClosing(input: DailyClosingInput): DailyClosingResult {
  const otherExpenses = input.otherExpenses ?? 0;
  const rossat = roundMoney(input.actualCash + input.tillExpenses - input.openingCash);
  const transferredToFund = roundMoney(input.actualCash - input.openingCash);
  const totalExpenses = roundMoney(input.tillExpenses + input.fundExpenses + otherExpenses);
  const net = roundMoney(rossat - totalExpenses);
  const fundBalance = roundMoney(input.openingFund + transferredToFund - input.fundExpenses);

  return {
    rossat,
    transferredToFund,
    totalExpenses,
    net,
    fundBalance,
  };
}