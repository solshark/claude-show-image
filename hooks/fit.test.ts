import { expect, test } from 'claude-code/testing'

import { fitCells } from './fit'

test('a wide image fills the width, its rows halved for the cell aspect', async () => {
  expect(fitCells(1600, 800, 80, 40)).toEqual({ columns: 80, rows: 20 })
})

test('a tall image is capped by rows and keeps its proportions', async () => {
  expect(fitCells(800, 1600, 80, 40)).toEqual({ columns: 40, rows: 40 })
})

test('a small image is not blown up past eight pixels per column', async () => {
  expect(fitCells(64, 64, 80, 40)).toEqual({ columns: 8, rows: 4 })
})

test('the box never leaves the 1 to 255 cell range', async () => {
  expect(fitCells(10000, 1, 80, 40)).toEqual({ columns: 80, rows: 1 })
})
