class BaseIntegration {
  constructor(tokens) {
    this.tokens = tokens;
  }

  async send(data) {
    throw new Error(`${this.constructor.name}.send() not implemented`);
  }

  async receive(data) {
    throw new Error(`${this.constructor.name}.receive() not implemented`);
  }

  async getStatus() {
    return { connected: !!this.tokens?.accessToken };
  }
}

module.exports = BaseIntegration;
