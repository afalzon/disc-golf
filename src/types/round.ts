export type GameType = 'standard' | 'scramble' | 'best-ball' | 'alternate-shot' | 'sixes'

export type RoundStatus = 'setup' | 'active' | 'finished'

export type RoundPlayer = {
  id: string
  name: string
  teamId?: string
}

export type RoundTeam = {
  id: string
  name: string
  playerIds: string[]
}

export type RoundScorecard = Record<string, Record<string, number | null>>
export type RoundScoreMeta = Record<string, Record<string, string>>

export type Round = {
  id: string
  courseId: string
  name: string
  gameType: GameType
  teamsEnabled: boolean
  status: RoundStatus
  createdAt: string
  updatedAt: string
  players: RoundPlayer[]
  teams: RoundTeam[]
  scores: RoundScorecard
  scoreMeta?: RoundScoreMeta
  currentHoleIndex: number
  revision: number
}

export const gameTypeOptions: Array<{
  value: GameType
  label: string
  description: string
  allowsOptionalTeams: boolean
}> = [
  {
    value: 'standard',
    label: 'Standard',
    description: 'Individual scoring by default.',
    allowsOptionalTeams: true,
  },
  {
    value: 'scramble',
    label: 'Scramble',
    description: 'Teams share the best shot.',
    allowsOptionalTeams: false,
  },
  {
    value: 'best-ball',
    label: 'Best ball',
    description: 'Best result on the card counts.',
    allowsOptionalTeams: false,
  },
  {
    value: 'alternate-shot',
    label: 'Alternate shot',
    description: 'Players take turns throwing.',
    allowsOptionalTeams: false,
  },
  {
    value: 'sixes',
    label: 'Sixes',
    description: 'Custom group play format.',
    allowsOptionalTeams: false,
  },
]
