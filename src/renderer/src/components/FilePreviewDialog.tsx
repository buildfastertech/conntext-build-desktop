import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import { X, FileText, Copy, Check, Search, ChevronUp, ChevronDown, Code2 } from 'lucide-react'
import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark.css'

const EXT_TO_LANG: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', rb: 'ruby', rs: 'rust', go: 'go', java: 'java',
    kt: 'kotlin', swift: 'swift', cs: 'csharp', cpp: 'cpp', c: 'c',
    h: 'c', hpp: 'cpp', php: 'php', vue: 'xml', svelte: 'xml',
    html: 'xml', htm: 'xml', xml: 'xml', svg: 'xml',
    css: 'css', scss: 'scss', less: 'less', sass: 'scss',
    json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'ini',
    sql: 'sql', graphql: 'graphql', gql: 'graphql',
    sh: 'bash', bash: 'bash', zsh: 'bash', fish: 'bash',
    ps1: 'powershell', bat: 'dos', cmd: 'dos',
    dockerfile: 'dockerfile', makefile: 'makefile',
    lua: 'lua', r: 'r', scala: 'scala', dart: 'dart',
    ex: 'elixir', exs: 'elixir', erl: 'erlang', hs: 'haskell',
    ml: 'ocaml', clj: 'clojure', lisp: 'lisp',
    tf: 'hcl', hcl: 'hcl', proto: 'protobuf',
    ini: 'ini', conf: 'ini', cfg: 'ini', env: 'ini',
}

interface Symbol {
    name: string
    kind: string
    line: number
}

// Extract function/class/method symbols from source code
function extractSymbols(content: string, lang: string | null): Symbol[] {
    const lines = content.split('\n')
    const symbols: Symbol[] = []

    const patterns: Array<{ regex: RegExp; kind: string; nameGroup: number }> = []

    if (['typescript', 'javascript'].includes(lang ?? '')) {
        patterns.push(
            { regex: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/, kind: 'function', nameGroup: 1 },
            { regex: /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(/, kind: 'function', nameGroup: 1 },
            { regex: /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=])\s*=>/, kind: 'function', nameGroup: 1 },
            { regex: /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/, kind: 'class', nameGroup: 1 },
            { regex: /^(?:export\s+)?interface\s+(\w+)/, kind: 'interface', nameGroup: 1 },
            { regex: /^(?:export\s+)?type\s+(\w+)\s*=/, kind: 'type', nameGroup: 1 },
            { regex: /^(?:export\s+)?enum\s+(\w+)/, kind: 'enum', nameGroup: 1 },
            { regex: /^\s+(?:async\s+)?(\w+)\s*\([^)]*\)\s*[:{]/, kind: 'method', nameGroup: 1 },
            { regex: /^\s+(?:get|set)\s+(\w+)\s*\(/, kind: 'method', nameGroup: 1 },
        )
    } else if (lang === 'python') {
        patterns.push(
            { regex: /^(?:async\s+)?def\s+(\w+)/, kind: 'function', nameGroup: 1 },
            { regex: /^class\s+(\w+)/, kind: 'class', nameGroup: 1 },
        )
    } else if (lang === 'rust') {
        patterns.push(
            { regex: /^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/, kind: 'function', nameGroup: 1 },
            { regex: /^(?:pub\s+)?struct\s+(\w+)/, kind: 'struct', nameGroup: 1 },
            { regex: /^(?:pub\s+)?enum\s+(\w+)/, kind: 'enum', nameGroup: 1 },
            { regex: /^(?:pub\s+)?trait\s+(\w+)/, kind: 'trait', nameGroup: 1 },
            { regex: /^impl(?:<[^>]*>)?\s+(\w+)/, kind: 'impl', nameGroup: 1 },
        )
    } else if (lang === 'go') {
        patterns.push(
            { regex: /^func\s+(?:\([^)]+\)\s+)?(\w+)/, kind: 'function', nameGroup: 1 },
            { regex: /^type\s+(\w+)\s+struct/, kind: 'struct', nameGroup: 1 },
            { regex: /^type\s+(\w+)\s+interface/, kind: 'interface', nameGroup: 1 },
        )
    } else if (lang === 'php') {
        patterns.push(
            { regex: /^(?:public|private|protected|static|\s)*function\s+(\w+)/, kind: 'function', nameGroup: 1 },
            { regex: /^(?:abstract\s+)?class\s+(\w+)/, kind: 'class', nameGroup: 1 },
            { regex: /^interface\s+(\w+)/, kind: 'interface', nameGroup: 1 },
        )
    } else if (lang === 'java' || lang === 'kotlin' || lang === 'csharp') {
        patterns.push(
            { regex: /^\s*(?:public|private|protected|static|abstract|override|suspend|\s)*(?:fun|void|int|string|boolean|Task|async)\s+(\w+)\s*\(/, kind: 'method', nameGroup: 1 },
            { regex: /^(?:public|private|internal|abstract|\s)*class\s+(\w+)/, kind: 'class', nameGroup: 1 },
            { regex: /^(?:public|private|internal|\s)*interface\s+(\w+)/, kind: 'interface', nameGroup: 1 },
        )
    } else if (lang === 'ruby') {
        patterns.push(
            { regex: /^\s*def\s+(\w+[?!]?)/, kind: 'method', nameGroup: 1 },
            { regex: /^class\s+(\w+)/, kind: 'class', nameGroup: 1 },
            { regex: /^module\s+(\w+)/, kind: 'module', nameGroup: 1 },
        )
    } else if (lang === 'css' || lang === 'scss' || lang === 'less') {
        patterns.push(
            { regex: /^\.(\w[\w-]*)/, kind: 'class', nameGroup: 1 },
            { regex: /^#(\w[\w-]*)/, kind: 'id', nameGroup: 1 },
            { regex: /^@media\s+(.+)\{?$/, kind: 'media', nameGroup: 1 },
        )
    } else {
        // Generic fallback — catch common patterns
        patterns.push(
            { regex: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/, kind: 'function', nameGroup: 1 },
            { regex: /^(?:pub\s+)?(?:async\s+)?(?:fn|def|func)\s+(\w+)/, kind: 'function', nameGroup: 1 },
            { regex: /^(?:class|struct|interface|trait|enum)\s+(\w+)/, kind: 'type', nameGroup: 1 },
        )
    }

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        for (const { regex, kind, nameGroup } of patterns) {
            const match = line.match(regex)
            if (match && match[nameGroup]) {
                // Avoid duplicate names on same line
                symbols.push({ name: match[nameGroup], kind, line: i + 1 })
                break
            }
        }
    }

    return symbols
}

const KIND_COLORS: Record<string, string> = {
    function: 'text-yellow-400',
    method: 'text-yellow-300',
    class: 'text-blue-400',
    interface: 'text-cyan-400',
    type: 'text-cyan-300',
    enum: 'text-green-400',
    struct: 'text-blue-300',
    trait: 'text-purple-400',
    impl: 'text-purple-300',
    module: 'text-orange-400',
    id: 'text-orange-300',
    media: 'text-pink-400',
}

interface FilePreviewDialogProps {
    isOpen: boolean
    onClose: () => void
    filePath: string
    workingDirectory: string
}

export function FilePreviewDialog({ isOpen, onClose, filePath, workingDirectory }: FilePreviewDialogProps) {
    const dialogRef = useRef<HTMLDivElement>(null)
    const contentRef = useRef<HTMLDivElement>(null)
    const searchInputRef = useRef<HTMLInputElement>(null)
    const [content, setContent] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)
    const [showSearch, setShowSearch] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [searchMatchIndex, setSearchMatchIndex] = useState(0)
    const [showSymbols, setShowSymbols] = useState(false)
    const [symbolFilter, setSymbolFilter] = useState('')
    const symbolInputRef = useRef<HTMLInputElement>(null)

    // Resolve the full path
    const fullPath = filePath.startsWith('/') || filePath.match(/^[A-Za-z]:/)
        ? filePath
        : `${workingDirectory.replace(/\\/g, '/')}/${filePath}`

    const fileName = filePath.replace(/\\/g, '/').split('/').pop() ?? filePath

    const ext = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() ?? '' : fileName.toLowerCase()
    const isMarkdown = ext === 'md' || ext === 'mdx'
    const language = EXT_TO_LANG[ext] ?? null

    useEffect(() => {
        if (!isOpen) return

        setIsLoading(true)
        setError(null)
        setContent(null)
        setShowSearch(false)
        setSearchQuery('')
        setShowSymbols(false)
        setSymbolFilter('')

        window.api.readFile(fullPath).then((data) => {
            if (data === '') {
                setError('File is empty or not found')
            } else {
                setContent(data)
            }
            setIsLoading(false)
        }).catch((err) => {
            setError(err?.message ?? 'Failed to read file')
            setIsLoading(false)
        })
    }, [isOpen, fullPath])

    const highlightedHtml = useMemo(() => {
        if (!content || isMarkdown) return null
        try {
            if (language) {
                return hljs.highlight(content, { language }).value
            }
            return hljs.highlightAuto(content).value
        } catch {
            return null
        }
    }, [content, language, isMarkdown])

    // Extract symbols from content
    const symbols = useMemo(() => {
        if (!content || isMarkdown) return []
        return extractSymbols(content, language)
    }, [content, language, isMarkdown])

    const filteredSymbols = useMemo(() => {
        if (!symbolFilter) return symbols
        const q = symbolFilter.toLowerCase()
        return symbols.filter(s => s.name.toLowerCase().includes(q) || s.kind.toLowerCase().includes(q))
    }, [symbols, symbolFilter])

    // Search matches
    const searchMatches = useMemo(() => {
        if (!content || !searchQuery) return []
        const matches: { line: number; index: number }[] = []
        const lines = content.split('\n')
        const q = searchQuery.toLowerCase()
        for (let i = 0; i < lines.length; i++) {
            let idx = lines[i].toLowerCase().indexOf(q)
            while (idx !== -1) {
                matches.push({ line: i + 1, index: idx })
                idx = lines[i].toLowerCase().indexOf(q, idx + 1)
            }
        }
        return matches
    }, [content, searchQuery])

    // Scroll to a specific line number
    const scrollToLine = useCallback((lineNum: number) => {
        if (!contentRef.current) return
        const lineElements = contentRef.current.querySelectorAll('[data-line]')
        for (const el of lineElements) {
            if (Number(el.getAttribute('data-line')) === lineNum) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' })
                // Flash highlight
                el.classList.add('bg-brand-purple/20')
                setTimeout(() => el.classList.remove('bg-brand-purple/20'), 1500)
                return
            }
        }
        // Fallback: estimate scroll position
        const lineHeight = 22 // approximate
        contentRef.current.scrollTop = (lineNum - 1) * lineHeight - contentRef.current.clientHeight / 3
    }, [])

    // Navigate search matches
    const goToSearchMatch = useCallback((index: number) => {
        if (searchMatches.length === 0) return
        const wrappedIndex = ((index % searchMatches.length) + searchMatches.length) % searchMatches.length
        setSearchMatchIndex(wrappedIndex)
        scrollToLine(searchMatches[wrappedIndex].line)
    }, [searchMatches, scrollToLine])

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (showSearch) {
                    setShowSearch(false)
                    setSearchQuery('')
                } else if (showSymbols) {
                    setShowSymbols(false)
                    setSymbolFilter('')
                } else {
                    onClose()
                }
                return
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault()
                setShowSearch(true)
                setShowSymbols(false)
                setTimeout(() => searchInputRef.current?.focus(), 50)
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
                e.preventDefault()
                setShowSymbols(true)
                setShowSearch(false)
                setTimeout(() => symbolInputRef.current?.focus(), 50)
            }
        }
        const handleClickOutside = (e: MouseEvent) => {
            if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) onClose()
        }

        if (isOpen) {
            document.addEventListener('keydown', handleKeyDown)
            document.addEventListener('mousedown', handleClickOutside)
        }
        return () => {
            document.removeEventListener('keydown', handleKeyDown)
            document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [isOpen, onClose, showSearch, showSymbols])

    // Focus search input when opened
    useEffect(() => {
        if (showSearch) setTimeout(() => searchInputRef.current?.focus(), 50)
    }, [showSearch])

    useEffect(() => {
        if (showSymbols) setTimeout(() => symbolInputRef.current?.focus(), 50)
    }, [showSymbols])

    const handleCopy = () => {
        if (content) {
            navigator.clipboard.writeText(content)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        }
    }

    // Build line-numbered highlighted content
    const lineNumberedHtml = useMemo(() => {
        if (!content || isMarkdown) return null
        const lines = (highlightedHtml ?? content).split('\n')
        return lines
    }, [content, highlightedHtml, isMarkdown])

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-6">
            <div
                ref={dialogRef}
                className="relative flex w-full max-h-[90vh] flex-col overflow-hidden rounded-xl border border-brand-border/60 bg-[#0d1117] shadow-2xl shadow-black/60"
            >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-brand-border/40 px-5 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-purple/15">
                            <FileText size={16} className="text-brand-purple" />
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <h3 className="text-[13px] font-semibold text-brand-text truncate">{fileName}</h3>
                                {language && (
                                    <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-brand-text-dim uppercase tracking-wide">
                                        {language}
                                    </span>
                                )}
                            </div>
                            <p className="text-[10px] text-brand-text-dim truncate">{filePath}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        {/* Symbol selector button */}
                        {symbols.length > 0 && (
                            <button
                                onClick={() => { setShowSymbols(!showSymbols); setShowSearch(false) }}
                                className={`cursor-pointer rounded-lg p-1.5 transition-colors ${showSymbols ? 'bg-brand-purple/20 text-brand-purple' : 'text-brand-text-dim hover:bg-white/[0.06] hover:text-brand-text'}`}
                                title={`Symbols (${symbols.length}) · Ctrl+G`}
                            >
                                <Code2 size={15} />
                            </button>
                        )}
                        {/* Search button */}
                        <button
                            onClick={() => { setShowSearch(!showSearch); setShowSymbols(false) }}
                            disabled={!content}
                            className={`cursor-pointer rounded-lg p-1.5 transition-colors disabled:opacity-30 ${showSearch ? 'bg-brand-purple/20 text-brand-purple' : 'text-brand-text-dim hover:bg-white/[0.06] hover:text-brand-text'}`}
                            title="Search · Ctrl+F"
                        >
                            <Search size={15} />
                        </button>
                        <button
                            onClick={handleCopy}
                            disabled={!content}
                            className="cursor-pointer rounded-lg p-1.5 text-brand-text-dim transition-colors hover:bg-white/[0.06] hover:text-brand-text disabled:opacity-30"
                            title="Copy contents"
                        >
                            {copied ? <Check size={15} className="text-green-400" /> : <Copy size={15} />}
                        </button>
                        <button
                            onClick={onClose}
                            className="cursor-pointer rounded-lg p-1.5 text-brand-text-dim transition-colors hover:bg-white/[0.06] hover:text-brand-text"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>

                {/* Search bar */}
                {showSearch && (
                    <div className="flex items-center gap-2 border-b border-brand-border/40 bg-[#161b22] px-4 py-2">
                        <Search size={14} className="text-brand-text-dim flex-shrink-0" />
                        <input
                            ref={searchInputRef}
                            type="text"
                            value={searchQuery}
                            onChange={(e) => { setSearchQuery(e.target.value); setSearchMatchIndex(0) }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault()
                                    goToSearchMatch(e.shiftKey ? searchMatchIndex - 1 : searchMatchIndex + 1)
                                }
                                if (e.key === 'Escape') {
                                    setShowSearch(false)
                                    setSearchQuery('')
                                }
                            }}
                            placeholder="Search in file..."
                            className="flex-1 bg-transparent text-[13px] text-brand-text placeholder-brand-text-dim/50 outline-none"
                        />
                        {searchQuery && (
                            <span className="text-[11px] text-brand-text-dim flex-shrink-0">
                                {searchMatches.length > 0 ? `${searchMatchIndex + 1} of ${searchMatches.length}` : 'No results'}
                            </span>
                        )}
                        <button
                            onClick={() => goToSearchMatch(searchMatchIndex - 1)}
                            disabled={searchMatches.length === 0}
                            className="cursor-pointer rounded p-0.5 text-brand-text-dim hover:bg-white/[0.06] hover:text-brand-text disabled:opacity-30"
                        >
                            <ChevronUp size={14} />
                        </button>
                        <button
                            onClick={() => goToSearchMatch(searchMatchIndex + 1)}
                            disabled={searchMatches.length === 0}
                            className="cursor-pointer rounded p-0.5 text-brand-text-dim hover:bg-white/[0.06] hover:text-brand-text disabled:opacity-30"
                        >
                            <ChevronDown size={14} />
                        </button>
                    </div>
                )}

                {/* Symbol selector */}
                {showSymbols && (
                    <div className="border-b border-brand-border/40 bg-[#161b22]">
                        <div className="flex items-center gap-2 px-4 py-2">
                            <Code2 size={14} className="text-brand-text-dim flex-shrink-0" />
                            <input
                                ref={symbolInputRef}
                                type="text"
                                value={symbolFilter}
                                onChange={(e) => setSymbolFilter(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Escape') {
                                        setShowSymbols(false)
                                        setSymbolFilter('')
                                    }
                                    if (e.key === 'Enter' && filteredSymbols.length > 0) {
                                        scrollToLine(filteredSymbols[0].line)
                                        setShowSymbols(false)
                                        setSymbolFilter('')
                                    }
                                }}
                                placeholder="Filter symbols... (functions, classes, etc.)"
                                className="flex-1 bg-transparent text-[13px] text-brand-text placeholder-brand-text-dim/50 outline-none"
                            />
                            <span className="text-[11px] text-brand-text-dim flex-shrink-0">
                                {filteredSymbols.length} symbol{filteredSymbols.length !== 1 ? 's' : ''}
                            </span>
                        </div>
                        <div className="max-h-[200px] overflow-auto px-2 pb-2">
                            {filteredSymbols.map((sym, i) => (
                                <button
                                    key={`${sym.name}-${sym.line}-${i}`}
                                    onClick={() => {
                                        scrollToLine(sym.line)
                                        setShowSymbols(false)
                                        setSymbolFilter('')
                                    }}
                                    className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12px] transition-colors hover:bg-white/[0.06]"
                                >
                                    <span className={`font-mono text-[10px] font-medium uppercase ${KIND_COLORS[sym.kind] ?? 'text-brand-text-dim'}`}>
                                        {sym.kind}
                                    </span>
                                    <span className="font-mono text-brand-text">{sym.name}</span>
                                    <span className="ml-auto text-[10px] text-brand-text-dim">L{sym.line}</span>
                                </button>
                            ))}
                            {filteredSymbols.length === 0 && (
                                <div className="px-2.5 py-3 text-center text-[12px] text-brand-text-dim">
                                    No symbols found
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Content */}
                <div ref={contentRef} className="flex-1 overflow-auto">
                    {isLoading && (
                        <div className="flex items-center justify-center py-12">
                            <svg className="h-6 w-6 animate-spin text-brand-purple" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                        </div>
                    )}

                    {error && (
                        <div className="m-5 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">
                            {error}
                        </div>
                    )}

                    {content && isMarkdown && (
                        <div className="prose-response p-5 text-sm text-brand-text select-text">
                            <ReactMarkdown>{content}</ReactMarkdown>
                        </div>
                    )}

                    {content && !isMarkdown && lineNumberedHtml && (
                        <table className="w-full border-collapse select-text font-mono text-[12.5px] leading-[1.7]">
                            <tbody>
                                {lineNumberedHtml.map((lineHtml, i) => {
                                    const lineNum = i + 1
                                    const isSearchHit = searchQuery && searchMatches.some(m => m.line === lineNum)
                                    const isActiveHit = searchQuery && searchMatches[searchMatchIndex]?.line === lineNum
                                    return (
                                        <tr
                                            key={i}
                                            data-line={lineNum}
                                            className={`transition-colors duration-300 ${isActiveHit ? 'bg-brand-purple/25' : isSearchHit ? 'bg-yellow-500/10' : 'hover:bg-white/[0.02]'}`}
                                        >
                                            <td className="w-[1%] whitespace-nowrap border-r border-white/[0.06] px-3 py-0 text-right text-[11px] text-white/20 select-none align-top">
                                                {lineNum}
                                            </td>
                                            <td className="px-4 py-0 whitespace-pre-wrap break-words">
                                                {highlightedHtml ? (
                                                    <span className="hljs" dangerouslySetInnerHTML={{ __html: lineHtml }} />
                                                ) : (
                                                    <span className="text-brand-text-secondary">{lineHtml}</span>
                                                )}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    )
}
