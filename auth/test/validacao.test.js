import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cpfValido } from '../src/usuarios/validacao.js'

test('aceita CPFs com dígitos verificadores corretos', () => {
  assert.equal(cpfValido('52998224725'), true)
  assert.equal(cpfValido('11144477735'), true)
})

test('recusa dígito verificador errado', () => {
  assert.equal(cpfValido('52998224726'), false)
  assert.equal(cpfValido('11144477734'), false)
})

test('recusa CPF com todos os dígitos iguais', () => {
  assert.equal(cpfValido('00000000000'), false)
  assert.equal(cpfValido('11111111111'), false)
})

test('recusa tamanho errado ou letras', () => {
  assert.equal(cpfValido('5299822472'), false)
  assert.equal(cpfValido('529982247250'), false)
  assert.equal(cpfValido('5299822472a'), false)
})
