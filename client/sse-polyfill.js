        // Polyfill for EventSource with POST support
        function EventSourcePolyfill(url, options) {
            options = options || {};
            const eventSourceInitDict = { withCredentials: options.withCredentials || false };
            let es;
            let lastEventId;
            let retryTimeout;
            let xhr;

            const self = this;
            this.readyState = 0;
            this.url = url;
            this.withCredentials = eventSourceInitDict.withCredentials;
            this.CONNECTING = 0;
            this.OPEN = 1;
            this.CLOSED = 2;

            const listeners = {};

            this.addEventListener = function(type, listener) {
                if (!listeners[type]) {
                    listeners[type] = [];
                }
                listeners[type].push(listener);
            };

            this.removeEventListener = function(type, listener) {
                if (!listeners[type]) return;
                const index = listeners[type].indexOf(listener);
                if (index !== -1) {
                    listeners[type].splice(index, 1);
                }
            };

            this.dispatchEvent = function(event) {
                const listenersForType = listeners[event.type];
                if (listenersForType) {
                    listenersForType.forEach(function(listener) {
                        listener.call(self, event);
                    });
                }
                if (event.type === 'open') {
                    this.onopen && this.onopen(event);
                } else if (event.type === 'error') {
                    this.onerror && this.onerror(event);
                } else if (event.type === 'message') {
                    this.onmessage && this.onmessage(event);
                }
            };

            this._close = function() {
                if (xhr) {
                    xhr.abort();
                    xhr = null;
                }
                this.readyState = this.CLOSED;
            };

            this.close = function() {
                this._close();
            };

            function parseEventChunk(chunk) {
                const event = { type: 'message', data: '', lastEventId: '' };
                const lines = chunk.split('\n');
                lines.forEach(function(line) {
                    line = line.trim();
                    if (line.startsWith('event:')) {
                        event.type = line.substring('event:'.length).trim();
                    } else if (line.startsWith('data:')) {
                        event.data += line.substring('data:'.length).trim() + '\n';
                    } else if (line.startsWith('id:')) {
                        event.lastEventId = line.substring('id:'.length).trim();
                    }
                });
                event.data = event.data.replace(/\n$/, '');
                return event;
            }

            function connect() {
                xhr = new XMLHttpRequest();
                xhr.open('POST', url, true);
                xhr.withCredentials = self.withCredentials;
                for (const header in options.headers) {
                    if (options.headers.hasOwnProperty(header)) {
                        xhr.setRequestHeader(header, options.headers[header]);
                    }
                }
                xhr.setRequestHeader('Cache-Control', 'no-cache');
                xhr.setRequestHeader('Accept', 'text/event-stream');

                let lastNewlineIndex = 0;
                let buffer = '';

                xhr.onreadystatechange = function() {
                    if (xhr.readyState >= 2 && xhr.status === 200 && self.readyState === self.CONNECTING) {
                        self.readyState = self.OPEN;
                        self.dispatchEvent({ type: 'open' });
                    }
                };

                xhr.onprogress = function() {
                    if (xhr.readyState === 3 || xhr.readyState === 4) {
                        const responseText = xhr.responseText || '';
                        const chunk = responseText.substring(lastNewlineIndex);
                        lastNewlineIndex = responseText.lastIndexOf('\n\n');

                        if (lastNewlineIndex === -1) {
                            lastNewlineIndex = responseText.length;
                        } else {
                            buffer += chunk;
                            const events = buffer.split('\n\n');
                            buffer = '';

                            events.forEach(function(rawEvent) {
                                if (rawEvent.trim().length === 0) return;
                                const event = parseEventChunk(rawEvent);
                                self.dispatchEvent(event);
                            });
                        }
                    }
                };

                xhr.onerror = function() {
                    self.dispatchEvent({ type: 'error', data: xhr.statusText });
                    self.close();
                };

                xhr.onloadend = function() {
                    if (self.readyState !== self.CLOSED) {
                        self.dispatchEvent({ type: 'error', data: xhr.statusText });
                        self.close();
                    }
                };

                xhr.send(options.payload);
            }

            connect();
        }
