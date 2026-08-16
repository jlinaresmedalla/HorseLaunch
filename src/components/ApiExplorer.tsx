import React, { useState, useEffect, useRef } from 'react';
import { Search, AlertCircle, Send, Globe, CheckCircle, Maximize2, Minimize2, Copy, Check } from 'lucide-react';

import { invoke } from '@tauri-apps/api/core';
import { JsonViewer } from './JsonViewer';

interface LogLine {
  id: string;
  output_type: 'stdout' | 'stderr' | 'info' | 'error' | 'exit';
  content: string;
  timestamp: string;
}

interface ApiExplorerProps {
  projectId: string;
  projectName: string;
  logs: LogLine[];
  isMaximized: boolean;
  onToggleMaximize: () => void;
  onClose: () => void;
}

interface ApiEndpoint {
  path: string;
  method: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: any[];
  requestBody?: any;
}

interface BackendResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export function ApiExplorer({ projectId, projectName, logs, isMaximized, onToggleMaximize, onClose }: ApiExplorerProps) {
  const [swaggerUrl, setSwaggerUrl] = useState(() => {
    return localStorage.getItem(`launcher_swagger_url_${projectId}`) || 'http://localhost:8000/openapi.json';
  });

  // Optional path prefix inserted between host and endpoint path when executing
  // e.g. if prefix is "/api/v1", then: host + /api/v1 + /pipelines
  const [pathPrefix, setPathPrefix] = useState(() => {
    return localStorage.getItem(`launcher_path_prefix_${projectId}`) || '';
  });
  const [showPathPrefix, setShowPathPrefix] = useState(() => {
    return !!localStorage.getItem(`launcher_path_prefix_${projectId}`);
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [endpoints, setEndpoints] = useState<ApiEndpoint[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEndpoint, setSelectedEndpoint] = useState<ApiEndpoint | null>(null);
  const [detectedStatus, setDetectedStatus] = useState<string | null>(null);

  // Resizable sidebar states
  const containerRef = useRef<HTMLDivElement>(null);
  const [sidebarWidth, setSidebarWidth] = useState(256);
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const newWidth = e.clientX - rect.left;
        setSidebarWidth(Math.max(180, Math.min(600, newWidth)));
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // Form states for execution
  const [pathParams, setPathParams] = useState<Record<string, string>>({});
  const [queryParams, setQueryParams] = useState<Record<string, string>>({});
  const [headers, setHeaders] = useState<Record<string, string>>({
    'Content-Type': 'application/json'
  });
  const [requestBody, setRequestBody] = useState<string>('{}');

  // Response states
  const [executing, setExecuting] = useState(false);
  const [responseStatus, setResponseStatus] = useState<number | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_responseHeaders, setResponseHeaders] = useState<Record<string, string>>({});
  const [responseBody, setResponseBody] = useState<string>('');
  const [responseTime, setResponseTime] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  // Manual endpoint entry mode (if Swagger/OpenAPI is not available)
  const [manualMode, setManualMode] = useState(false);
  const [manualMethod, setManualMethod] = useState('GET');
  const [manualPath, setManualPath] = useState('http://localhost:8000/api/v1/resource');

  const hasAutoDetected = useRef(false);

  // Save swagger url
  useEffect(() => {
    if (swaggerUrl) {
      localStorage.setItem(`launcher_swagger_url_${projectId}`, swaggerUrl);
    }
  }, [swaggerUrl, projectId]);

  // Load saved endpoints schema if any
  useEffect(() => {
    const savedSchema = localStorage.getItem(`launcher_swagger_schema_${projectId}`);
    if (savedSchema) {
      try {
        parseSwaggerSchema(JSON.parse(savedSchema));
      } catch (e) {
        console.error('Error loading saved schema:', e);
      }
    }
  }, [projectId]);

  // Auto-detect base URL and Swagger JSON from logs
  useEffect(() => {
    if (hasAutoDetected.current || logs.length === 0 || endpoints.length > 0) return;

    // Scan logs for URLs like http://localhost:8000, http://127.0.0.1:5000, etc.
    const urlRegex = /(https?:\/\/localhost:\d+|https?:\/\/127\.0\.0\.1:\d+|https?:\/\/0\.0\.0\.0:\d+)/i;
    let detectedBaseUrl: string | null = null;

    for (const log of logs) {
      const match = log.content.match(urlRegex);
      if (match) {
        // Replace 0.0.0.0 with localhost for fetching
        detectedBaseUrl = match[1].replace('0.0.0.0', 'localhost');
        break;
      }
    }

    if (detectedBaseUrl) {
      hasAutoDetected.current = true;
      probeSwaggerEndpoints(detectedBaseUrl);
    }
  }, [logs, endpoints.length]);

  const probeSwaggerEndpoints = async (baseUrl: string) => {
    // All path combinations to probe: basePaths x jsonSuffixes
    // This handles: FastAPI (/openapi.json), Connexion (/api/v1/openapi.json),
    // ASP.NET Core (/swagger/v1/swagger.json), Flask-RESTX (/swagger.json), etc.
    const basePaths = [
      '',
      '/api/v1',
      '/api/v2',
      '/api',
      '/api/util',
      '/api/generic',
    ];
    const jsonSuffixes = [
      '/openapi.json',
      '/swagger.json',
      '/swagger/v1/swagger.json',
      '/api-docs',
      '/v2/api-docs',
    ];

    setLoading(true);
    setDetectedStatus('Buscando endpoints activos...');

    // Build all unique URLs to probe
    const urlsToProbe: string[] = [];
    const seen = new Set<string>();
    for (const base of basePaths) {
      for (const suffix of jsonSuffixes) {
        const fullUrl = `${baseUrl}${base}${suffix}`;
        if (!seen.has(fullUrl)) {
          seen.add(fullUrl);
          urlsToProbe.push(fullUrl);
        }
      }
    }

    // Fire all requests in parallel for speed
    const tryFetch = async (url: string): Promise<{ url: string; data: any } | null> => {
      try {
        const responseText: string = await invoke('fetch_external_url', { url });
        const data = JSON.parse(responseText);
        if (data && (data.paths || data.openapi || data.swagger)) {
          return { url, data };
        }
      } catch (_) { /* ignore */ }
      return null;
    };

    const results = await Promise.allSettled(urlsToProbe.map(tryFetch));
    const foundSchemas = results
      .filter((r): r is PromiseFulfilledResult<{ url: string; data: any }> =>
        r.status === 'fulfilled' && r.value !== null
      )
      .map(r => r.value);

    if (foundSchemas.length > 0) {
      const merged = mergeSchemas(foundSchemas.map(s => s.data));
      const primaryUrl = foundSchemas[0].url;
      setSwaggerUrl(primaryUrl);
      localStorage.setItem(`launcher_swagger_url_${projectId}`, primaryUrl);
      localStorage.setItem(`launcher_swagger_schema_${projectId}`, JSON.stringify(merged));
      parseSwaggerSchema(merged);

      const msg = foundSchemas.length > 1
        ? `¡${foundSchemas.length} esquemas combinados automáticamente!`
        : `¡API auto-detectada!`;
      setDetectedStatus(msg);
      setTimeout(() => setDetectedStatus(null), 6000);
    } else {
      setDetectedStatus(null);
    }

    setLoading(false);
  };

  /**
   * Merges multiple OpenAPI schemas into one combined schema.
   * All paths from all schemas are collected, with a prefix tag showing which
   * spec they came from if they differ.
   */
  const mergeSchemas = (schemas: any[]): any => {
    if (schemas.length === 1) return schemas[0];

    const base = { ...schemas[0] };
    base.paths = { ...(base.paths || {}) };

    for (let i = 1; i < schemas.length; i++) {
      const schema = schemas[i];
      if (schema.paths) {
        Object.entries(schema.paths).forEach(([path, pathItem]) => {
          if (!base.paths[path]) {
            base.paths[path] = pathItem;
          }
        });
      }
      // Merge components/schemas if present
      if (schema.components?.schemas && base.components) {
        base.components.schemas = {
          ...(base.components.schemas || {}),
          ...schema.components.schemas,
        };
      }
    }

    return base;
  };



  const fetchSwagger = async () => {
    setLoading(true);
    setError(null);

    let targetUrls = [swaggerUrl];
    const errorDetails: string[] = [];

    // If it's an HTML page, first download the HTML to extract the JSON schema URL from its javascript code!
    if (swaggerUrl.endsWith('.html') || swaggerUrl.includes('/docs') || swaggerUrl.includes('/swagger')) {
      try {
        setDetectedStatus("Leyendo página HTML de Swagger...");
        const htmlText: string = await invoke('fetch_external_url', { url: swaggerUrl });
        
        // Regex to search for patterns like: url: "/api/generic/docs/v1/swagger.json" or url = '...'
        const urlMatch = htmlText.match(/url\s*:\s*["']([^"']+\.json[^"']*)["']/i) ||
                         htmlText.match(/url\s*=\s*["']([^"']+\.json[^"']*)["']/i) ||
                         htmlText.match(/["']url["']\s*:\s*["']([^"']+\.json[^"']*)["']/i);
        
        if (urlMatch) {
          const extractedPath = urlMatch[1];
          // Resolve relative URL to absolute URL based on the current page URL
          const resolvedUrl = new URL(extractedPath, swaggerUrl).href;
          targetUrls.unshift(resolvedUrl); // Put it at the beginning to try it first!
          console.log("Swagger JSON URL auto-detected from HTML:", resolvedUrl);
        }
      } catch (e: any) {
        console.warn("Could not parse index.html for swagger JSON path:", e);
      }

      // Add common fallbacks
      try {
        const parsed = new URL(swaggerUrl);
        const basePath = parsed.origin + parsed.pathname.substring(0, parsed.pathname.lastIndexOf('/') + 1);
        targetUrls.push(`${basePath}swagger.json`);
        targetUrls.push(`${basePath}openapi.json`);
        targetUrls.push(`${basePath}v1/swagger.json`);
        targetUrls.push(`${basePath}swagger/v1/swagger.json`);
        
        const parentPath = parsed.origin + parsed.pathname.substring(0, parsed.pathname.lastIndexOf('/', parsed.pathname.lastIndexOf('/') - 1) + 1);
        targetUrls.push(`${parentPath}swagger.json`);
        targetUrls.push(`${parentPath}openapi.json`);
        targetUrls.push(`${parentPath}docs/v1/swagger.json`);
      } catch {}
    }

    // De-duplicate URLs
    targetUrls = Array.from(new Set(targetUrls));

    for (let i = 0; i < targetUrls.length; i++) {
      const url = targetUrls[i];
      try {
        setDetectedStatus(`Descargando esquema: ${new URL(url).pathname}...`);
        
        // Use Rust backend to bypass CORS
        const responseText: string = await invoke('fetch_external_url', { url });
        
        let data;
        try {
          data = JSON.parse(responseText);
        } catch (jsonErr: any) {
          throw new Error("El servidor respondió pero no es un JSON válido.");
        }
        
        if (data && (data.paths || data.openapi || data.swagger)) {
          // If we succeeded on a fallback URL, update the swaggerUrl input
          if (url !== swaggerUrl) {
            setSwaggerUrl(url);
          }
          localStorage.setItem(`launcher_swagger_schema_${projectId}`, JSON.stringify(data));
          parseSwaggerSchema(data);
          setManualMode(false);
          setDetectedStatus('API cargada correctamente');
          setTimeout(() => setDetectedStatus(null), 3000);
          setLoading(false);
          return;
        } else {
          throw new Error("JSON no contiene rutas o especificación OpenAPI/Swagger.");
        }
      } catch (err: any) {
        console.warn(`Failed to fetch from ${url}:`, err);
        const cleanErr = err.message || String(err).replace("transport error: ", "");
        errorDetails.push(`• ${url} → ${cleanErr}`);
      }
    }

    // Format final error message with all attempted URLs
    setError(
      `No se pudo cargar un esquema JSON de OpenAPI válido.\n\nIntentos realizados:\n${errorDetails.join('\n')}\n\nSugerencia: Puedes buscar la URL del JSON real (usualmente termina en swagger.json o openapi.json) usando la pestaña 'Network' del inspector del navegador en tu Swagger UI.`
    );
    setDetectedStatus(null);
    setLoading(false);
  };

  const parseSwaggerSchema = (schema: any) => {
    const parsedList: ApiEndpoint[] = [];
    if (!schema || !schema.paths) return;

    Object.entries(schema.paths).forEach(([path, pathItem]: [string, any]) => {
      Object.entries(pathItem).forEach(([method, operation]: [string, any]) => {
        // Only HTTP Methods
        if (['get', 'post', 'put', 'delete', 'patch', 'options', 'head'].includes(method)) {
          parsedList.push({
            path,
            method: method.toUpperCase(),
            summary: operation.summary,
            description: operation.description,
            tags: operation.tags || ['default'],
            parameters: operation.parameters || [],
            requestBody: operation.requestBody
          });
        }
      });
    });

    setEndpoints(parsedList);
    if (parsedList.length > 0) {
      setSelectedEndpoint(parsedList[0]);
    }
  };

  // Pre-fill parameters and request body template when selected endpoint changes
  useEffect(() => {
    if (!selectedEndpoint) return;

    const storageKey = `launcher_api_payload_${projectId}_${selectedEndpoint.method}_${selectedEndpoint.path}`;
    const savedPayloadRaw = localStorage.getItem(storageKey);

    if (savedPayloadRaw) {
      try {
        const saved = JSON.parse(savedPayloadRaw);
        setPathParams(saved.pathParams || {});
        setQueryParams(saved.queryParams || {});
        setHeaders(prev => ({ ...prev, ...(saved.headers || {}) }));
        setRequestBody(saved.requestBody || '{}');
        return; // Carga exitosa, omitir generación de plantilla
      } catch (e) {
        console.error('Error parsing saved endpoint payload:', e);
      }
    }

    // Reset inputs si no hay guardado previo
    const initialPathParams: Record<string, string> = {};
    const initialQueryParams: Record<string, string> = {};
    const initialHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    // Filter path & query params
    if (selectedEndpoint.parameters) {
      selectedEndpoint.parameters.forEach((param: any) => {
        if (param.in === 'path') {
          initialPathParams[param.name] = param.example || param.default || '';
        } else if (param.in === 'query') {
          initialQueryParams[param.name] = param.example || param.default || '';
        } else if (param.in === 'header') {
          initialHeaders[param.name] = param.example || param.default || '';
        }
      });
    }

    setPathParams(initialPathParams);
    setQueryParams(initialQueryParams);
    setHeaders(initialHeaders);

    // Form template body
    let bodyTemplate = '{}';
    if (selectedEndpoint.requestBody) {
      const content = selectedEndpoint.requestBody.content;
      if (content && content['application/json']) {
        const schema = content['application/json'].schema;
        if (schema && schema.properties) {
          const templateObj: Record<string, any> = {};
          Object.entries(schema.properties).forEach(([key, prop]: [string, any]) => {
            if (prop.type === 'string') {
              templateObj[key] = prop.example || (prop.format === 'date-time' ? new Date().toISOString() : 'string');
            } else if (prop.type === 'number' || prop.type === 'integer') {
              templateObj[key] = prop.example || 0;
            } else if (prop.type === 'boolean') {
              templateObj[key] = prop.example || false;
            } else if (prop.type === 'array') {
              templateObj[key] = [];
            } else {
              templateObj[key] = {};
            }
          });
          bodyTemplate = JSON.stringify(templateObj, null, 2);
        }
      }
    }
    setRequestBody(bodyTemplate);
  }, [selectedEndpoint, projectId]);

  const executeRequest = async () => {
    setExecuting(true);
    setResponseStatus(null);
    setResponseBody('');
    const startTime = performance.now();

    try {
      let url = '';
      let method = 'GET';
      let body: string | undefined = undefined;

      if (manualMode) {
        url = manualPath;
        method = manualMethod;
        if (['POST', 'PUT', 'PATCH'].includes(method)) {
          body = requestBody;
        }
      } else {
        if (!selectedEndpoint) return;
        method = selectedEndpoint.method;
        
        // Build base URL: extract host from swagger URL, then optionally add path prefix
        let baseUrl = 'http://localhost:8000';
        try {
          const parsedUrl = new URL(swaggerUrl);
          baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;
        } catch {}

        // Append optional path prefix (e.g. /api/v1)
        const prefix = pathPrefix.trim().replace(/\/$/, '');
        if (prefix) {
          baseUrl = `${baseUrl}${prefix.startsWith('/') ? prefix : '/' + prefix}`;
        }

        // Replace path params
        let finalPath = selectedEndpoint.path;
        Object.entries(pathParams).forEach(([key, val]) => {
          finalPath = finalPath.replace(`{${key}}`, encodeURIComponent(val));
        });

        // Append query params
        const qParams = new URLSearchParams();
        Object.entries(queryParams).forEach(([key, val]) => {
          if (val) qParams.append(key, val);
        });
        const queryString = qParams.toString();
        
        url = `${baseUrl}${finalPath}${queryString ? `?${queryString}` : ''}`;
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && selectedEndpoint.requestBody) {
          body = requestBody;
        }
      }
      
      // Guardar el payload para reusarlo después
      if (!manualMode && selectedEndpoint) {
        const storageKey = `launcher_api_payload_${projectId}_${selectedEndpoint.method}_${selectedEndpoint.path}`;
        localStorage.setItem(storageKey, JSON.stringify({
          pathParams,
          queryParams,
          headers,
          requestBody
        }));
      }

      // Execute request through the Rust backend (Bypasses CORS completely!)
      const res: BackendResponse = await invoke('execute_backend_request', {
        url,
        method,
        headers,
        body: body || null,
      });

      const endTime = performance.now();
      setResponseTime(Math.round(endTime - startTime));
      setResponseStatus(res.status);
      setResponseHeaders(res.headers);
      setResponseBody(res.body);
    } catch (err: any) {
      const endTime = performance.now();
      setResponseTime(Math.round(endTime - startTime));
      setResponseStatus(0);
      setResponseBody(JSON.stringify({ error: err.message || 'Unknown network error' }, null, 2));
    } finally {
      setExecuting(false);
    }
  };

  const filteredEndpoints = endpoints.filter(ep => {
    const term = searchTerm.toLowerCase();
    return ep.path.toLowerCase().includes(term) || 
           (ep.summary && ep.summary.toLowerCase().includes(term));
  });

  const getMethodClass = (method: string) => `api-method api-method--${method.toLowerCase()}`;

  const getStatusColor = (status: number) => {
    if (status >= 200 && status < 300) return 'var(--status-success)';
    if (status >= 300 && status < 400) return 'var(--status-info)';
    if (status >= 400 && status < 500) return 'var(--status-warning)';
    return 'var(--status-error)';
  };

  return (
    <div className="api-explorer w-full h-full flex flex-col font-sans">
      {/* Header */}
      <div className="api-explorer__header flex items-center justify-between px-4 py-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="api-explorer__mark">⚡</span>
          <span className="api-explorer__title">API Client</span>
          <span className="api-explorer__project">{projectName}</span>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={onToggleMaximize}
            className="api-icon-button"
            title={isMaximized ? "Restaurar" : "Maximizar"}
          >
            {isMaximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
          <button 
            onClick={onClose}
            className="api-button api-button--quiet"
          >
            Cerrar ✕
          </button>
        </div>
      </div>

      {/* Connection bar */}
      <div className="api-explorer__connection p-3 flex flex-col gap-2 flex-shrink-0">
        {/* Row 1: Swagger discovery URL */}
        <div className="flex items-center gap-2">
          <div className="api-field-label">Swagger URL</div>
          <input
            type="text"
            value={swaggerUrl}
            onChange={(e) => setSwaggerUrl(e.target.value)}
            disabled={manualMode}
            placeholder="http://localhost:8000/openapi.json"
            className="api-control api-control--compact flex-1 font-mono"
          />
          <button
            onClick={fetchSwagger}
            disabled={loading || manualMode}
            className="api-button api-button--primary"
          >
            {loading ? 'Cargando...' : 'Escanear'}
          </button>
          <button
            onClick={() => {
              setManualMode(!manualMode);
              if (!manualMode) {
                setSelectedEndpoint(null);
              } else if (endpoints.length > 0) {
                setSelectedEndpoint(endpoints[0]);
              }
            }}
            className={`api-button ${manualMode ? 'api-button--selected' : 'api-button--quiet'}`}
          >
            Manual
          </button>
          {/* Toggle button for path prefix */}
          <button
            title={showPathPrefix ? 'Ocultar prefijo de ruta' : 'Agregar prefijo de ruta para ejecución (ej: /api/v1)'}
            onClick={() => {
              const next = !showPathPrefix;
              setShowPathPrefix(next);
              if (!next) {
                setPathPrefix('');
                localStorage.removeItem(`launcher_path_prefix_${projectId}`);
              }
            }}
            className={`api-button font-mono ${showPathPrefix ? 'api-button--warning' : 'api-button--quiet'}`}
          >
            ⚡ Prefijo
          </button>
        </div>

        {/* Row 2: Optional path prefix */}
        {showPathPrefix && (
          <div className="flex items-center gap-2">
            <div className="api-field-label api-field-label--warning">Prefijo</div>
            <div className="api-control api-prefix-control flex items-center flex-1 overflow-hidden font-mono">
              <span className="api-prefix-control__origin">
                {(() => { try { return new URL(swaggerUrl).origin; } catch { return 'http://localhost:8000'; } })()}
              </span>
              <input
                type="text"
                value={pathPrefix}
                onChange={(e) => {
                  setPathPrefix(e.target.value);
                  if (e.target.value.trim()) {
                    localStorage.setItem(`launcher_path_prefix_${projectId}`, e.target.value.trim());
                  } else {
                    localStorage.removeItem(`launcher_path_prefix_${projectId}`);
                  }
                }}
                placeholder="/api/v1"
                className="api-prefix-control__input flex-1"
              />
              {pathPrefix.trim() && (
                <span className="api-prefix-control__state">⚡ activa</span>
              )}
            </div>
          </div>
        )}

        {/* Dynamic Detection status toast/badge */}
        {detectedStatus && (
          <div className="api-detected-status">
            <CheckCircle size={11} className="animate-pulse" />
            <span className="font-mono">{detectedStatus}</span>
          </div>
        )}
      </div>

      {error && (
        <div className="api-error p-3 m-2 text-xs flex gap-2 items-start font-sans whitespace-pre-wrap">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
        </div>
      )}

      {/* Main layout */}
      <div ref={containerRef} className="flex-1 flex overflow-hidden">
        {/* Endpoints Sidebar (Only in Swagger Mode) */}
        {!manualMode ? (
          <div 
            className="api-explorer__sidebar flex flex-col flex-shrink-0"
            style={{ width: `${sidebarWidth}px` }}
          >
            <div className="api-explorer__search p-2">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Filtrar endpoints..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="api-control api-control--compact w-full pl-7"
                />
                <Search size={12} className="api-search-icon absolute left-2.5 top-2" />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {filteredEndpoints.length === 0 ? (
                <div className="api-empty p-4 text-center text-xs">
                  No se encontraron endpoints. Escanea la API primero.
                </div>
              ) : (
                filteredEndpoints.map((ep, idx) => {
                  const isSelected = selectedEndpoint?.path === ep.path && selectedEndpoint?.method === ep.method;
                  return (
                    <button
                      key={idx}
                      onClick={() => setSelectedEndpoint(ep)}
                      className={`api-endpoint w-full text-left p-2 flex flex-col gap-1 ${isSelected ? 'is-selected' : ''}`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span 
                          className={`${getMethodClass(ep.method)} flex-shrink-0 text-center w-12`}
                        >
                          {ep.method}
                        </span>
                        <span className="api-endpoint__path text-xs font-mono truncate">{ep.path}</span>
                      </div>
                      {ep.summary && (
                        <span className="api-endpoint__summary truncate pl-1">{ep.summary}</span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        ) : null}

        {/* Drag Handle Divider (Only in Swagger Mode) */}
        {!manualMode && (
          <div 
            onMouseDown={handleMouseDown} 
            className={`api-resize-handle cursor-col-resize flex-shrink-0 ${isDragging ? 'is-dragging' : ''}`}
            title="Arrastra para cambiar el tamaño"
          />
        )}

        {/* Execution & Panel Area */}
        <div className="api-explorer__workspace flex-1 flex flex-col overflow-y-auto p-4 gap-4">
          {manualMode ? (
            <div className="flex flex-col gap-3">
              <h3 className="api-section-title">Petición personalizada</h3>
              <div className="flex gap-2 font-sans">
                <select
                  value={manualMethod}
                  onChange={(e) => setManualMethod(e.target.value)}
                  className="api-control font-bold"
                >
                  {['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'].map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={manualPath}
                  onChange={(e) => setManualPath(e.target.value)}
                  placeholder="http://localhost:8000/api/v1/resource"
                  className="api-control flex-1 font-mono"
                />
              </div>
            </div>
          ) : selectedEndpoint ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className={getMethodClass(selectedEndpoint.method)}>
                  {selectedEndpoint.method}
                </span>
                <span className="api-endpoint-title text-sm font-mono font-semibold">{selectedEndpoint.path}</span>
              </div>
              {selectedEndpoint.summary && (
                <p className="api-copy text-xs pl-1">{selectedEndpoint.summary}</p>
              )}
              {selectedEndpoint.description && (
                <p className="api-copy api-copy--muted text-[11px] italic pl-1">{selectedEndpoint.description}</p>
              )}
            </div>
          ) : (
            <div className="api-empty flex-1 flex flex-col items-center justify-center text-center gap-2">
              <Globe size={32} className="opacity-30" />
              <p className="text-xs">Por favor introduce el Swagger JSON URL y haz click en "Escanear"</p>
            </div>
          )}

          {/* Form Parameters & Body */}
          {(selectedEndpoint || manualMode) && (
            <div className="api-request-form flex flex-col gap-4 pt-4">
              {/* Path parameters */}
              {!manualMode && Object.keys(pathParams).length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="api-subsection-title">Path parameters</span>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(pathParams).map(([key, val]) => (
                      <div key={key} className="flex flex-col gap-1">
                        <label className="api-field-label font-mono">{key}</label>
                        <input
                          type="text"
                          value={val}
                          onChange={(e) => setPathParams(prev => ({ ...prev, [key]: e.target.value }))}
                          className="api-control api-control--compact"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Query parameters */}
              {!manualMode && Object.keys(queryParams).length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="api-subsection-title">Query parameters</span>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(queryParams).map(([key, val]) => (
                      <div key={key} className="flex flex-col gap-1">
                        <label className="api-field-label font-mono">{key}</label>
                        <input
                          type="text"
                          value={val}
                          onChange={(e) => setQueryParams(prev => ({ ...prev, [key]: e.target.value }))}
                          className="api-control api-control--compact"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Headers Configuration */}
              <div className="api-subsection flex flex-col gap-1.5 p-2.5">
                <div className="flex justify-between items-center">
                  <span className="api-subsection-title">Headers personalizados</span>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="api-copy api-copy--muted text-[10px] font-sans">Formato: LLAVE=valor, uno por línea</label>
                  <textarea
                    rows={3}
                    value={Object.entries(headers)
                      .filter(([k]) => k !== 'Content-Type' && k !== 'Accept')
                      .map(([k, v]) => `${k}=${v}`)
                      .join('\n')}
                    onChange={(e) => {
                      const lines = e.target.value.split('\n');
                      const newHeaders: Record<string, string> = {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                      };
                      lines.forEach(line => {
                        const eqIdx = line.indexOf('=');
                        if (eqIdx > 0) {
                          const key = line.slice(0, eqIdx).trim();
                          const val = line.slice(eqIdx + 1).trim();
                          if (key) {
                            newHeaders[key] = val;
                          }
                        }
                      });
                      setHeaders(newHeaders);
                    }}
                    placeholder={`Authorization=Bearer eyJhbGciOi...\nX-API-Key=mi-llave-secreta`}
                    className="api-control api-code-input w-full p-2 font-mono resize-none"
                  />
                </div>
              </div>

              {/* Body Content Editor */}
              {((!manualMode && ['POST', 'PUT', 'PATCH'].includes(selectedEndpoint?.method || '')) || 
                (manualMode && ['POST', 'PUT', 'PATCH'].includes(manualMethod))) && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-center">
                    <span className="api-subsection-title">Request body (JSON)</span>
                  </div>
                  <textarea
                    rows={6}
                    value={requestBody}
                    onChange={(e) => setRequestBody(e.target.value)}
                    className="api-control api-code-input w-full font-mono p-2"
                  />
                </div>
              )}

              {/* Execute action button */}
              <div>
                <button
                  onClick={executeRequest}
                  disabled={executing}
                  className="api-send-button w-full flex items-center justify-center gap-2 py-2 px-4 text-xs font-bold disabled:opacity-50"
                >
                  {executing ? (
                    <>Enviando...</>
                  ) : (
                    <>
                      <Send size={12} />
                      Enviar Petición
                    </>
                  )}
                </button>
              </div>

              {/* Response Section */}
              {(responseStatus !== null || responseBody) && (
                <div className="api-response flex flex-col gap-2 pt-4">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="api-subsection-title font-sans">Respuesta</span>
                      {responseBody && (
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(responseBody);
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2000);
                          }}
                          className="api-button api-button--quiet flex items-center gap-1"
                          title="Copiar respuesta al portapapeles"
                        >
                          {copied ? (
                            <>
                              <Check size={10} className="text-green-400" />
                              <span className="text-green-400 font-sans">Copiado</span>
                            </>
                          ) : (
                            <>
                              <Copy size={10} />
                              <span className="font-sans">Copiar</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                    <div className="flex gap-3 text-[11px]">
                      {responseStatus !== null && (
                        <span className="font-sans">
                          Status: <span style={{ color: getStatusColor(responseStatus) }} className="font-mono font-bold">{responseStatus}</span>
                        </span>
                      )}
                      {responseTime !== null && (
                        <span className="api-copy api-copy--muted font-sans">
                          Time: <span className="font-mono">{responseTime} ms</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="api-response-body p-3 overflow-x-auto max-h-[300px] text-[11px] font-mono">
                    {responseBody ? (
                      <JsonViewer content={responseBody} maxPreviewLength={200} />
                    ) : (
                      <span className="api-empty text-xs">Sin contenido de respuesta.</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
