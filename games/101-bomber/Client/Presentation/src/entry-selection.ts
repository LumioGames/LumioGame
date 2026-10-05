import { createAudio } from './audio'
import { CHARACTER_ORDER, type CharacterId } from './contract'
import { CharacterSelect, loadLastCharacter, saveLastCharacter } from './hud/character-select'
import { selectCards } from './hud/select-model'
import { uiScale } from './hud/format'
import { loadSettings } from './present/settings'
import { projectReplicaConfig } from './replica-config'
import type { ReplicaConfig } from './replica-types'
import { renderDollPortraits } from './view'

/** User intent only. No world, player, transport or authoritative state exists here. */
export async function chooseEntryCharacter(root: HTMLElement, source: ReplicaConfig, signal: AbortSignal): Promise<CharacterId> {
  signal.throwIfAborted()
  const { config, rules, catalog } = projectReplicaConfig(source)
  rules.characters = Object.fromEntries(Object.entries(rules.characters)
    .filter(([id]) => [...catalog.characters.values()].includes(id as CharacterId))) as typeof rules.characters
  const characters = CHARACTER_ORDER.filter(id => Object.hasOwn(rules.characters, id))
  const animals = characters.map(id => rules.characters[id].animal)
  const portraits = await renderDollPortraits(animals)
  signal.throwIfAborted()
  if (animals.some(animal => !portraits.has(animal))) throw new Error('character_portraits_unavailable')
  const audio = createAudio({ muted: loadSettings().muted, rules })
  root.classList.add('bomber-hud', 'hud')
  root.style.setProperty('--u', uiScale(root.clientWidth || innerWidth, root.clientHeight || innerHeight).toFixed(3))
  return new Promise((resolve, reject) => {
    const finish = (confirmed = false): void => {
      signal.removeEventListener('abort', abort)
      picker.dispose()
      // uiConfirm owns a 0.4-second voice; keep its tail alive after the card closes.
      if (confirmed) setTimeout(() => audio.dispose(), 450)
      else audio.dispose()
    }
    const abort = (): void => { finish(); reject(signal.reason) }
    const picker = new CharacterSelect({ host: root, mode: 'start', cards: selectCards(rules, config), portraits,
      onGesture: () => audio.unlock(), onSound: kind => audio.ui(kind),
      onConfirm: id => { saveLastCharacter(id); finish(true); resolve(id) } })
    signal.addEventListener('abort', abort, { once: true })
    const remembered = loadLastCharacter()
    picker.show(characters.find(id => id === remembered) ?? null)
  })
}
