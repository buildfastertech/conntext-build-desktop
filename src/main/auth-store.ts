import Store from 'electron-store'

interface Credentials {
  apiUrl: string
  apiToken: string
  user: {
    id: string
    name: string
    email: string
  }
}

export class AuthStore {
  private store: Store

  constructor() {
    this.store = new Store({
      name: 'conntext-build-auth',
      encryptionKey: 'conntext-build-local-encryption'
    })
  }

  getCredentials(): Credentials | null {
    const apiUrl = this.store.get('apiUrl') as string | undefined
    const apiToken = this.store.get('apiToken') as string | undefined
    const user = this.store.get('user') as Credentials['user'] | undefined

    if (!apiUrl || !apiToken || !user) return null

    return { apiUrl, apiToken, user }
  }

  saveCredentials(credentials: Credentials): void {
    this.store.set('apiUrl', credentials.apiUrl)
    this.store.set('apiToken', credentials.apiToken)
    this.store.set('user', credentials.user)
  }

  clearCredentials(): void {
    this.store.delete('apiUrl')
    this.store.delete('apiToken')
    this.store.delete('user')
  }

  getAnthropicKey(): string | null {
    return this.store.get('anthropicApiKey') as string | undefined || null
  }

  saveAnthropicKey(apiKey: string): void {
    this.store.set('anthropicApiKey', apiKey)
  }

  clearAnthropicKey(): void {
    this.store.delete('anthropicApiKey')
  }
}
