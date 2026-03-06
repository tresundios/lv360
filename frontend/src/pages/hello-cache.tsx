import { useQuery } from "@tanstack/react-query"
import { Content } from "@/components/layout"
import axiosInstance from "@/lib/axios"

interface HelloCacheResponse {
  source: string
  message: string
  id: number
  cached: boolean
}

function fetchHelloCache(): Promise<HelloCacheResponse> {
  return axiosInstance.get("/api/hello-cache").then((res) => res.data)
}

export function HelloCachePage() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["hello-cache"],
    queryFn: fetchHelloCache,
    staleTime: 0,
  })

  return (
    <Content centered>
      <div className="mx-auto max-w-lg space-y-6">
        <h1 className="text-3xl font-bold">Hello World — Cached Flow</h1>
        <p className="text-sm text-muted-foreground">
          Flow: Redis (cache) → PostgreSQL (fallback) → FastAPI → React
        </p>

        <div className="rounded-lg border bg-card p-6 shadow-sm">
          {isLoading && (
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="text-muted-foreground">Checking cache…</span>
            </div>
          )}

          {isError && (
            <div className="space-y-2">
              <p className="font-medium text-destructive">Error</p>
              <p className="text-sm text-muted-foreground">
                {(error as Error)?.message ?? "Failed to fetch"}
              </p>
            </div>
          )}

          {data && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    data.source === "redis"
                      ? "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200"
                      : "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                  }`}
                >
                  {data.source}
                </span>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    data.cached
                      ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                      : "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200"
                  }`}
                >
                  {data.cached ? "cache hit" : "cache miss"}
                </span>
              </div>
              <p className="text-2xl font-semibold">
                {data.message}{" "}
                {data.cached && (
                  <span className="text-lg text-muted-foreground">
                    (Cached)
                  </span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                Record ID: {data.id}
              </p>
            </div>
          )}
        </div>

        <button
          onClick={() => refetch()}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Refetch (observe cache hit)
        </button>
      </div>
    </Content>
  )
}
