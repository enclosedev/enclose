import type { ComponentType } from 'react'
import { CAD } from './cad'
import { DRAWINGS } from './drawings'
import { MORE } from './more'
import { PCB } from './pcb'
import { WHY } from './why'

/** Each card's piece of the app, by the name pages/home/features.ts gives it. */
export const SCENES: Record<string, ComponentType> = { ...WHY, ...CAD, ...DRAWINGS, ...PCB, ...MORE }
