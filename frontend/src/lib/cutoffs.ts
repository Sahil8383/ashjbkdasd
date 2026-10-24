// Decision times offered in the UI (D-1, UK local). GB day-ahead auctions close at
// 09:20 (EPEX) and 09:50 (N2EX), so 09:15 and 09:45 are the last practical cutoffs for each.
export const CUTOFFS: { value: string; label: string }[] = [
  { value: '06:00', label: '06:00' },
  { value: '08:00', label: '08:00' },
  { value: '09:00', label: '09:00' },
  { value: '09:15', label: '09:15 (EPEX closes 09:20)' },
  { value: '09:45', label: '09:45 (N2EX closes 09:50)' },
  { value: '11:00', label: '11:00' },
  { value: '12:00', label: '12:00' },
]
