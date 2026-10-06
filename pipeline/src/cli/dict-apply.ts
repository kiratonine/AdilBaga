import { resolve } from 'node:path'
import { readDictionary, writeDictionary } from '../mapping/dictionary.js'
import { applyOverrides, readOverrides } from '../mapping/overrides.js'

const MAPPING = resolve(import.meta.dirname, '../../../data/mapping')
const dict = readDictionary(resolve(MAPPING, 'dictionary.json'))
const overrides = readOverrides(resolve(MAPPING, 'overrides.json'))
const next = applyOverrides(dict, overrides)
writeDictionary(resolve(MAPPING, 'dictionary.json'), next)
console.log(`[dict:apply] canonicals ${Object.keys(dict.canonicals).length} → ${Object.keys(next.canonicals).length}; moves ${overrides.moveCategory.length}, splits ${overrides.split.length}, approvals ${overrides.approve.length}`)
