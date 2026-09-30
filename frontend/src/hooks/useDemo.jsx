import { createContext, useContext, useState } from 'react'
import { DEMO_CLUBS, DEMO_PEOPLE, DEMO_START_RELATIONS } from '../services/demoData'

// Delat tillstånd för demo-flödet. Allt ligger bara i minnet och försvinner
// när sidan laddas om, vilket är meningen: demon ska alltid börja från noll.

const DemoContext = createContext(null)

const EMPTY_PROFILE = { name: '', municipality: '', district: '', interests: [] }

function initialState() {
  return {
    username: '',
    loggedIn: false,
    profile: EMPTY_PROFILE,
    // personId → 'sent' | 'incoming' | 'contact'. Saknas = ingen relation.
    relations: { ...DEMO_START_RELATIONS },
    clubs: DEMO_CLUBS.map((club) => ({ ...club, joined: false, mine: false })),
  }
}

export function DemoProvider({ children }) {
  const [state, setState] = useState(initialState)

  function setRelation(personId, relation) {
    setState((s) => {
      const relations = { ...s.relations }
      if (relation === null) delete relations[personId]
      else relations[personId] = relation
      return { ...s, relations }
    })
  }

  const actions = {
    register: (username) => setState((s) => ({ ...s, username })),
    login: (username) => setState((s) => ({ ...s, username: username || s.username, loggedIn: true })),
    logout: () => setState(initialState()),
    saveProfile: (profile) => setState((s) => ({ ...s, profile })),

    sendRequest: (personId) => setRelation(personId, 'sent'),
    cancelRequest: (personId) => setRelation(personId, null),
    acceptRequest: (personId) => setRelation(personId, 'contact'),
    declineRequest: (personId) => setRelation(personId, null),
    removeContact: (personId) => setRelation(personId, null),

    toggleClub: (clubId) =>
      setState((s) => ({
        ...s,
        clubs: s.clubs.map((c) =>
          c.id === clubId
            ? { ...c, joined: !c.joined, members: c.members + (c.joined ? -1 : 1) }
            : c,
        ),
      })),
    createClub: (club) =>
      setState((s) => ({
        ...s,
        clubs: [
          { ...club, id: Math.max(0, ...s.clubs.map((c) => c.id)) + 1, members: 1, joined: true, mine: true },
          ...s.clubs,
        ],
      })),
  }

  return <DemoContext.Provider value={{ ...state, ...actions }}>{children}</DemoContext.Provider>
}

export function useDemo() {
  return useContext(DemoContext)
}

export function hasProfile(profile) {
  return profile.name.trim() !== '' && profile.municipality !== '' && profile.interests.length > 0
}

// Personer sorterade efter hur bra de matchar: flest gemensamma intressen
// först, sedan närmast. Personer utan något gemensamt intresse kommer sist.
export function matchPeople(profile) {
  return DEMO_PEOPLE.map((person) => ({
    ...person,
    shared: person.interests.filter((i) => profile.interests.includes(i)),
  })).sort((a, b) => b.shared.length - a.shared.length || a.distanceKm - b.distanceKm)
}

export function personById(id) {
  return DEMO_PEOPLE.find((p) => p.id === Number(id))
}
