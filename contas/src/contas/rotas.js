const DUPLICADO = '23505'

rotasContas.post('/contas', async (req, res) => {
  const { chave_pix } = validar(esquemaCriarConta, req.body)

  try {
    const conta = await criarConta(req.usuarioId, chave_pix)
    res.status(201).json(conta)
  } catch (erro) {
    if (erro.code === DUPLICADO) throw new ErroHttp(409, 'chave pix já cadastrada')
    throw erro
  }
})