class TamilSummarizer {
    constructor() {
        this.corpus = [];
        this.tamilCorpus = new Map();
        this.machineHumanPairs = [];
        this.humanizationPatterns = new Map();
        this.isLoading = false;
        this.initializeUI();
        this.loadData();
    }

    initializeUI() {
        const inputText = document.getElementById('inputText');
        const summarizeBtn = document.getElementById('summarizeBtn');
        const clearBtn = document.getElementById('clearBtn');
        const copyBtn = document.getElementById('copyBtn');

        // Update stats on input
        inputText.addEventListener('input', () => {
            this.updateStats('input');
        });

        // Summarize button
        summarizeBtn.addEventListener('click', () => {
            this.summarize();
        });

        // Clear button
        clearBtn.addEventListener('click', () => {
            document.getElementById('inputText').value = '';
            document.getElementById('outputText').value = '';
            this.updateStats('input');
            this.updateStats('output');
        });

        // Copy button
        copyBtn.addEventListener('click', () => {
            const outputText = document.getElementById('outputText');
            if (outputText.value) {
                navigator.clipboard.writeText(outputText.value).then(() => {
                    this.showSuccess('Summary copied to clipboard!');
                }).catch(() => {
                    this.showError('Failed to copy summary');
                });
            }
        });

        // Allow Ctrl+Enter to summarize
        inputText.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                this.summarize();
            }
        });
    }

    async loadData() {
        try {
            this.showLoading(true);
            
            // Load corpus
            const corpusResponse = await fetch('English Tamil Corpus Updated frequently.csv');
            const corpusText = await corpusResponse.text();
            this.parseCorpus(corpusText);
            
            // Load Machine vs Human Tamil from GitHub
            const humanizationResponse = await fetch('https://raw.githubusercontent.com/smartsw33t/corpus/main/Machine%20Vs%20Human%20Tamil%20CSV.csv');
            const humanizationText = await humanizationResponse.text();
            this.parseHumanizationData(humanizationText);
            
            this.showLoading(false);
        } catch (error) {
            console.error('Error loading data:', error);
            this.showError('Warning: Could not load corpus or humanization data. Summarization may be less accurate.');
            this.showLoading(false);
        }
    }

    parseCorpus(csvText) {
        const lines = csvText.split('\n');
        const headers = this.parseCSVLine(lines[0]);
        
        const englishIndex = headers.findIndex(h => h.toLowerCase().includes('english'));
        const tamilIndex = headers.findIndex(h => h.toLowerCase().includes('tamil'));

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const values = this.parseCSVLine(line);
            if (values.length > Math.max(englishIndex, tamilIndex)) {
                const english = values[englishIndex]?.trim();
                const tamil = values[tamilIndex]?.trim();
                
                if (english && tamil) {
                    this.corpus.push({ english, tamil });
                    
                    // Index Tamil text by words for quick lookup
                    const words = this.tokenizeTamil(tamil);
                    words.forEach(word => {
                        if (!this.tamilCorpus.has(word)) {
                            this.tamilCorpus.set(word, []);
                        }
                        this.tamilCorpus.get(word).push(tamil);
                    });
                }
            }
        }
    }

    parseHumanizationData(csvText) {
        const lines = csvText.split('\n');
        const headers = this.parseCSVLine(lines[0]);
        
        const machineIndex = headers.findIndex(h => h.toLowerCase().includes('machine'));
        const humanIndex = headers.findIndex(h => h.toLowerCase().includes('human') && !h.toLowerCase().includes('machine'));

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const values = this.parseCSVLine(line);
            if (values.length > Math.max(machineIndex, humanIndex)) {
                const machineText = values[machineIndex]?.trim();
                const humanText = values[humanIndex]?.trim();
                
                if (machineText && humanText) {
                    this.machineHumanPairs.push({ machine: machineText, human: humanText });
                    
                    // Extract words that were changed
                    const machineWords = this.tokenizeTamil(machineText);
                    const humanWords = this.tokenizeTamil(humanText);
                    
                    // Store machine→human word mappings for humanization
                    machineWords.forEach(word => {
                        if (!this.humanizationPatterns.has(word)) {
                            this.humanizationPatterns.set(word, []);
                        }
                        // Add human alternatives
                        if (humanWords.length > 0) {
                            const humanAlts = this.humanizationPatterns.get(word);
                            humanWords.forEach(hw => {
                                if (!humanAlts.includes(hw)) {
                                    humanAlts.push(hw);
                                }
                            });
                        }
                    });
                }
            }
        }
    }

    parseCSVLine(line) {
        const result = [];
        let current = '';
        let insideQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            const nextChar = line[i + 1];

            if (char === '"') {
                if (insideQuotes && nextChar === '"') {
                    current += '"';
                    i++;
                } else {
                    insideQuotes = !insideQuotes;
                }
            } else if (char === ',' && !insideQuotes) {
                result.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current);
        return result;
    }

    tokenizeTamil(text) {
        // Tamil tokenization - split by spaces and common punctuation
        return text
            .split(/[\s\-।.\,\!\?]+/)
            .filter(word => word.length > 1)
            .map(word => word.toLowerCase());
    }

    extractSentences(text) {
        // Split by period, exclamation, question mark
        const sentences = text
            .split(/[।.!\?]+/)
            .map(s => s.trim())
            .filter(s => s.length > 0);
        
        return sentences;
    }

    calculateSentenceScore(sentence, allSentences) {
        const words = this.tokenizeTamil(sentence);
        
        // Calculate word frequency
        const wordFreq = {};
        allSentences.forEach(sent => {
            this.tokenizeTamil(sent).forEach(word => {
                wordFreq[word] = (wordFreq[word] || 0) + 1;
            });
        });

        // Score based on word frequency (TF-like scoring)
        let score = 0;
        words.forEach(word => {
            const freq = wordFreq[word] || 0;
            // Penalize very common words
            if (freq < allSentences.length * 0.7) {
                score += freq;
            }
        });

        // Boost score if sentence contains corpus-validated words
        let corpusWordCount = 0;
        words.forEach(word => {
            if (this.tamilCorpus.has(word)) {
                corpusWordCount++;
            }
        });
        score += corpusWordCount * 2; // Boost for corpus-validated words

        // Normalize by sentence length
        score = score / (words.length || 1);

        return score;
    }

    humanizeText(text) {
        // Apply humanization patterns from machine vs human pairs
        let humanized = text;
        
        // Process the text to find and replace machine-like patterns with human alternatives
        for (const [machineWord, humanAlternatives] of this.humanizationPatterns) {
            if (humanAlternatives.length > 0) {
                // Use the first human alternative (most common replacement)
                const humanWord = humanAlternatives[0];
                
                // Replace word boundaries to avoid partial matches
                const regex = new RegExp(`\\b${this.escapeRegex(machineWord)}\\b`, 'gi');
                humanized = humanized.replace(regex, humanWord);
            }
        }
        
        // Additional humanization: validate all words against corpus
        const words = this.tokenizeTamil(humanized);
        let finalScore = 0;
        words.forEach(word => {
            if (this.tamilCorpus.has(word)) {
                finalScore++;
            }
        });
        
        // The text is now humanized with real alternatives from the dataset
        return humanized;
    }

    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    summarize() {
        const inputText = document.getElementById('inputText').value.trim();
        
        if (!inputText) {
            this.showError('Please enter Tamil text to summarize.');
            return;
        }

        this.showLoading(true);
        this.showError('');
        this.showSuccess('');

        // Use setTimeout to allow UI to update
        setTimeout(() => {
            try {
                const sentences = this.extractSentences(inputText);
                
                if (sentences.length === 0) {
                    this.showError('Could not extract sentences. Please check your input.');
                    this.showLoading(false);
                    return;
                }

                // Calculate target summary length (10% of original)
                const originalLength = inputText.length;
                const targetLength = Math.ceil(originalLength * 0.1);

                // Score all sentences
                const scoredSentences = sentences.map((sent, index) => ({
                    text: sent,
                    score: this.calculateSentenceScore(sent, sentences),
                    originalIndex: index
                }));

                // Sort by score and select top sentences
                const topSentences = scoredSentences
                    .sort((a, b) => b.score - a.score)
                    .slice(0, Math.max(1, Math.ceil(sentences.length * 0.1)))
                    .sort((a, b) => a.originalIndex - b.originalIndex)
                    .map(s => s.text);

                // Build summary
                let summary = topSentences.join('। ');
                
                // HUMANIZE THE SUMMARY - Apply machine vs human patterns
                summary = this.humanizeText(summary);

                // If summary is still too long, truncate intelligently
                if (summary.length > targetLength * 1.5) {
                    const words = this.tokenizeTamil(summary);
                    const targetWords = Math.max(1, Math.ceil(words.length * 0.7));
                    
                    // Reconstruct from tokens
                    let truncated = '';
                    let wordCount = 0;
                    for (let i = 0; i < topSentences.length && wordCount < targetWords; i++) {
                        const sent = topSentences[i];
                        const sentWords = this.tokenizeTamil(sent).length;
                        
                        if (wordCount + sentWords <= targetWords || truncated.length === 0) {
                            truncated += (truncated ? '। ' : '') + sent;
                            wordCount += sentWords;
                        }
                    }
                    summary = truncated;
                }

                // Add period at the end if not present
                if (!summary.match(/[।.!?]$/)) {
                    summary += '।';
                }

                // DISPLAY ONLY HUMANIZED SUMMARY
                document.getElementById('outputText').value = summary;
                this.updateStats('output');
                this.showSuccess('Summary generated successfully!');

            } catch (error) {
                console.error('Summarization error:', error);
                this.showError('Error during summarization. Please try again.');
            }

            this.showLoading(false);
        }, 100);
    }

    updateStats(type) {
        const textarea = document.getElementById(type === 'input' ? 'inputText' : 'outputText');
        const text = textarea.value;

        // Count characters
        const charCount = text.length;
        document.getElementById(type + 'CharCount').textContent = charCount.toLocaleString();

        // Count words (Tamil words can have zero-width joiners, so be conservative)
        const words = this.tokenizeTamil(text);
        const wordCount = words.length;
        document.getElementById(type + 'WordCount').textContent = wordCount.toLocaleString();

        // Update compression ratio
        if (type === 'output') {
            const inputText = document.getElementById('inputText').value;
            const inputChars = inputText.length;
            const outputChars = text.length;
            
            if (inputChars > 0) {
                const ratio = Math.round((outputChars / inputChars) * 100);
                document.getElementById('compressionRatio').textContent = ratio + '%';
            }
        }
    }

    showError(message) {
        const errorEl = document.getElementById('errorMsg');
        if (message) {
            errorEl.textContent = message;
            errorEl.classList.add('show');
        } else {
            errorEl.classList.remove('show');
        }
    }

    showSuccess(message) {
        const successEl = document.getElementById('successMsg');
        if (message) {
            successEl.textContent = message;
            successEl.classList.add('show');
            setTimeout(() => {
                successEl.classList.remove('show');
            }, 3000);
        }
    }

    showLoading(isLoading) {
        const loading = document.getElementById('loading');
        const summarizeBtn = document.getElementById('summarizeBtn');
        
        if (isLoading) {
            loading.classList.add('active');
            summarizeBtn.disabled = true;
        } else {
            loading.classList.remove('active');
            summarizeBtn.disabled = false;
        }
    }
}

// Initialize the summarizer when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new TamilSummarizer();
});
