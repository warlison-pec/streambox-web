// Inatividade para a proteção de tela.
class Idle {
  active = $state(false);
  last = Date.now();
  touch() { this.last = Date.now(); }
}
export const idle = new Idle();
