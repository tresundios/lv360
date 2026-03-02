import { useQuery } from "@tanstack/react-query"
import { Content } from "@/components/layout"
import axiosInstance from "@/lib/axios"

interface HelloDbResponse {
  source: string
  message: string
  id: number
}

function fetchHelloDb(): Promise<HelloDbResponse> {
  return axiosInstance.get("/api/hello-db").then((res) => res.data)
}

export function HelloDbPage() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["hello-db"],
    queryFn: fetchHelloDb,
  })

  return (
    <Content centered>
      <div className="mx-auto max-w-lg space-y-6">
        <h1 className="text-3xl font-bold">Hello World — DB Flow</h1>
        <p className="text-sm text-muted-foreground">
          Flow: PostgreSQL → FastAPI → React
        </p>

        <div className="rounded-lg border bg-card p-6 shadow-sm">
          {isLoading && (
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="text-muted-foreground">
                Fetching from database…
              </span>
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
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-200">
                  {data.source}
                </span>
              </div>
              <p className="text-2xl font-semibold">{data.message}</p>
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
          Refetch
        </button>
      </div>
    </Content>
  )
}
