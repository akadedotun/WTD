import { useEffect, useMemo, useState, type MouseEvent } from "react"

const asset = (name: string) => `/assets/${name}`

type Status = "off" | "warn" | "block"
type Country = "UK" | "ROI"
type StateFilter = "Any state" | "Block" | "Warn" | "Off" | "Statutory" | "Scheduled changes"

type Rule = {
  id: string
  name: string
  description: string
  status: Status
  countries: Country[]
  appliesTo: string
  statutory?: boolean
  locked?: boolean
  lockNote?: string
  notice?: string
  scheduled?: boolean
  effective: string
  lastChange: string
  changedBy: string
}

type RuleGroup = {
  title: string
  description: string
  rules: Rule[]
}

type RuleEdits = {
  countries: Country[]
  locations: string[]
  employeeGroups: string[]
  takesEffect: "now" | "date"
  effectiveDate?: string
}

type SavedChange = {
  rule: Rule
  status: Status
  edits: RuleEdits
  previousStatus: Status
  previousEdits?: RuleEdits
  statusOnly?: boolean
  cancelledSchedule?: boolean
  previousMeta?: ChangeMeta
}

type ChangeMeta = { lastChange: string; changedBy: string }

const currentUser = "C. Moreno"

const todayShort = () => {
  const today = new Date()
  return `${today.getDate()}/${today.getMonth() + 1}/${String(
    today.getFullYear(),
  ).slice(2)}`
}

// "3/9/25" (day/month/year) -> sortable number
const lastChangeValue = (value: string) => {
  const [day, month, year] = value.split("/").map(Number)
  return (2000 + year) * 10000 + month * 100 + day
}

const withoutCancelledSchedule = (
  rule: Rule,
  cancelledSchedules: Record<string, boolean>,
): Rule =>
  rule.scheduled && cancelledSchedules[rule.id]
    ? { ...rule, scheduled: false, notice: undefined, effective: "Live" }
    : rule

const formatAppliesTo = (countries: Country[]) => {
  if (countries.includes("UK") && countries.includes("ROI")) {
    return "All UK and ROI locations"
  }
  if (countries.includes("UK")) return "All UK locations"
  if (countries.includes("ROI")) return "ROI only"
  return "No countries selected"
}

const locationCountries: Record<string, Country> = {
  London: "UK",
  Manchester: "UK",
  Dublin: "ROI",
}

const locationImpact: Record<
  string,
  { employees: number; locations: number; schedulers: number }
> = {
  UK: { employees: 1240, locations: 38, schedulers: 112 },
  ROI: { employees: 420, locations: 12, schedulers: 46 },
  London: { employees: 310, locations: 1, schedulers: 22 },
  Manchester: { employees: 180, locations: 1, schedulers: 14 },
  Dublin: { employees: 150, locations: 1, schedulers: 11 },
}

const employeeGroupShare: Record<string, number> = {
  "Young workers": 0.08,
  "Night workers": 0.15,
}

const hasSpecificLocations = (locations?: string[]) =>
  !!locations && !locations.includes("All locations")

const hasSpecificGroups = (groups?: string[]) =>
  !!groups && !groups.includes("All employees")

// Countries a rule actually covers once specific locations are picked
const scopeCountries = (countries: Country[], locations?: string[]) =>
  hasSpecificLocations(locations)
    ? countries.filter((country) =>
        locations!.some((location) => locationCountries[location] === country),
      )
    : countries

const formatLocations = (countries: Country[], locations?: string[]) =>
  hasSpecificLocations(locations)
    ? locations!.join(", ")
    : formatAppliesTo(countries)

const formatEmployeeGroups = (groups?: string[]) =>
  hasSpecificGroups(groups) ? groups!.join(", ") : null

const formatScope = (
  countries: Country[],
  locations?: string[],
  groups?: string[],
) =>
  [formatLocations(countries, locations), formatEmployeeGroups(groups)]
    .filter(Boolean)
    .join(" · ")

const formatImpact = (
  countries: Country[],
  locations?: string[],
  groups?: string[],
) => {
  const areas = hasSpecificLocations(locations) ? locations! : countries
  const total = areas.reduce(
    (sum, area) => ({
      employees: sum.employees + (locationImpact[area]?.employees ?? 0),
      locations: sum.locations + (locationImpact[area]?.locations ?? 0),
      schedulers: sum.schedulers + (locationImpact[area]?.schedulers ?? 0),
    }),
    { employees: 0, locations: 0, schedulers: 0 },
  )
  const share = hasSpecificGroups(groups)
    ? Math.min(
        1,
        groups!.reduce((sum, group) => sum + (employeeGroupShare[group] ?? 0), 0),
      )
    : 1
  const employees = Math.round(total.employees * share)
  const plural = (count: number, word: string) =>
    `${count.toLocaleString("en-GB")} ${word}${count === 1 ? "" : "s"}`
  return `${plural(employees, "employee")}, ${plural(total.locations, "location")}, ${plural(total.schedulers, "scheduler")}`
}

// "1 Dec 26" -> "2026-12-01", so the date field matches the table
const parseEffectiveDate = (value: string) => {
  const match = value.match(/^(\d{1,2}) ([A-Za-z]{3}) (\d{2})$/)
  if (!match) return undefined
  const month =
    [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ].indexOf(match[2]) + 1
  if (!month) return undefined
  return `20${match[3]}-${String(month).padStart(2, "0")}-${match[1].padStart(2, "0")}`
}

const formatEffectiveDate = (value: string) => {
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  })
}

const initialGroups: RuleGroup[] = [
  {
    title: "Rest and breaks",
    description: "Protects the time off between and during shifts",
    rules: [
      {
        id: "daily-rest",
        name: "Daily rest (11 hours)",
        description: "Workers must get 11 hours rest between shifts",
        status: "warn",
        countries: ["UK"],
        appliesTo: "All UK locations",
        statutory: true,
        effective: "Live",
        lastChange: "1/10/26",
        changedBy: "C. Moreno",
      },
      {
        id: "weekly-rest",
        name: "Weekly rest (24 hours)",
        description: "Workers must get 24 hours uninterrupted rest each week",
        status: "warn",
        countries: ["UK", "ROI"],
        appliesTo: "All UK and ROI locations",
        statutory: true,
        locked: true,
        lockNote: "Cannot be turned off.",
        notice: "Changes to Block from 1 Nov 2026",
        scheduled: true,
        effective: "1 Nov 26",
        lastChange: "2/10/26",
        changedBy: "Tom Reilly",
      },
      {
        id: "maximum-consecutive-days",
        name: "Maximum consecutive working days",
        description: "Staff should not work more than 6 days in a row",
        status: "off",
        countries: ["UK", "ROI"],
        appliesTo: "All UK and ROI locations",
        effective: "Live",
        lastChange: "2/10/26",
        changedBy: "Tom Reilly",
      },
      {
        id: "rest-breaks",
        name: "Rest breaks (20 min after 6 hours)",
        description:
          "Workers must get 20 min break when a shift is longer than 6 hours",
        status: "warn",
        countries: ["UK"],
        appliesTo: "All UK locations",
        statutory: true,
        locked: true,
        lockNote: "Cannot be turned off.",
        effective: "Live",
        lastChange: "12/11/25",
        changedBy: "Rotageek",
      },
    ],
  },
  {
    title: "Working hours",
    description: "Protect against working too long",
    rules: [
      {
        id: "weekly-hours",
        name: "48 hour average weekly limit",
        description: "Average working week must not go over 48 hours",
        status: "warn",
        countries: ["UK", "ROI"],
        appliesTo: "All UK and ROI locations",
        statutory: true,
        notice: "48 hour limit should be an average across 17 weeks.",
        effective: "Live",
        lastChange: "1/11/25",
        changedBy: "Rotageek",
      },
      {
        id: "maximum-daily-hours",
        name: "Maximum daily hours",
        description: "No more than 12 hours worked in a day",
        status: "block",
        countries: ["ROI"],
        appliesTo: "ROI only",
        effective: "Live",
        lastChange: "12/10/25",
        changedBy: "Priya Shah",
      },
      {
        id: "young-workers",
        name: "Young workers: working hours",
        description:
          "Under 18s can work no more than 8 hours a day and 40 hours a week",
        status: "block",
        countries: ["UK", "ROI"],
        appliesTo: "All UK and ROI locations",
        statutory: true,
        locked: true,
        lockNote: "Cannot be turned off.",
        effective: "Live",
        lastChange: "12/10/25",
        changedBy: "Rotageek",
      },
      {
        id: "night-work",
        name: "Night work limits",
        description: "Night workers must average no more than 8 hours in 24",
        status: "warn",
        countries: ["UK"],
        appliesTo: "All UK locations",
        statutory: true,
        locked: true,
        lockNote: "Cannot be turned off.",
        effective: "1 Dec 26",
        lastChange: "3/9/25",
        changedBy: "C. Moreno",
      },
    ],
  },
]

// First-time setup: Rotageek's defaults, untouched by the customer
const firstTimeGroups: RuleGroup[] = initialGroups.map((group) => ({
  ...group,
  rules: group.rules.map((rule) => ({
    ...rule,
    scheduled: false,
    notice: rule.scheduled ? undefined : rule.notice,
    effective: "Live",
    lastChange: todayShort(),
    changedBy: "Rotageek",
  })),
}))

const statusIcons: Record<Status, string> = {
  warn: "27b54.svg",
  off: "c50c1.svg",
  block: "bc67d.svg",
}

const chevrons: Record<Status, string> = {
  warn: "e146c.svg",
  off: "f2f4d.svg",
  block: "2391d.svg",
}

function Brand() {
  return (
    <div className="brand" aria-label="Rotageek">
      <span className="brand-icon">
        <img src={asset("3744c.png")} alt="" />
      </span>
      <span className="brand-word">
        <img src={asset("19f32.png")} alt="" />
      </span>
    </div>
  )
}

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const primary = [
    "Home",
    "Schedule",
    "Time and attendance",
    "Forecasting",
    "Payroll",
    "People",
  ]

  return (
    <>
      {open && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={onClose}
        />
      )}
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <Brand />
        <nav aria-label="Primary navigation">
          <div className="primary-nav">
            {primary.map((item) => (
              <button key={item}>{item}</button>
            ))}
          </div>
          <button className="active">Compliance</button>
        </nav>
        <div className="profile">
          <img className="nav-rule" src={asset("3b443.svg")} alt="" />
          <div className="profile-details">
            <img src={asset("ea5f8.png")} alt="Cremilda Moreno" />
            <div>
              <strong>Cremilda Moreno</strong>
              <span>Compliance Admin</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}

function StatusBadge({
  status,
  dropdown = false,
  wide = false,
  legend = false,
  onClick,
}: {
  status: Status
  dropdown?: boolean
  wide?: boolean
  legend?: boolean
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void
}) {
  const icon =
    legend && status === "off"
      ? "5521d.svg"
      : legend && status === "warn"
        ? "fae22.svg"
        : statusIcons[status]
  const content = (
    <>
      <span>
        <img src={asset(icon)} alt="" />
        {status}
      </span>
      {dropdown && (
        <img className="chevron" src={asset(chevrons[status])} alt="" />
      )}
    </>
  )

  if (dropdown) {
    return (
      <button
        className={`status status-${status} status-dropdown`}
        onClick={onClick}
        aria-label={`Current status: ${status}. Change status`}
      >
        {content}
      </button>
    )
  }

  return (
    <span className={`status status-${status}${wide ? " status-wide" : ""}`}>
      {content}
    </span>
  )
}

function UnderstandingRules({
  mobileOpen,
  onToggle,
}: {
  mobileOpen: boolean
  onToggle: () => void
}) {
  return (
    <section className="understanding" aria-labelledby="understanding-title">
      <button
        className="mobile-understanding-toggle"
        onClick={onToggle}
        aria-expanded={mobileOpen}
      >
        What do Off, Warn and Block mean?
        <span>{mobileOpen ? "−" : "⌄"}</span>
      </button>
      <h2 id="understanding-title">Understanding rules</h2>
      <div className={`understanding-card ${mobileOpen ? "mobile-open" : ""}`}>
        <div>
          <div className="legend-title">
            <StatusBadge status="off" legend />
            <strong>Off</strong>
          </div>
          <p>Rotageek does not check this rule</p>
        </div>
        <div>
          <div className="legend-title">
            <StatusBadge status="warn" legend />
            <strong>Warn</strong>
          </div>
          <p>Managers see a warning but can still publish the shift</p>
        </div>
        <div>
          <div className="legend-title">
            <StatusBadge status="block" />
            <strong>Block</strong>
          </div>
          <p>The shift cannot be saved until the issue is fixed</p>
        </div>
      </div>
    </section>
  )
}

function RuleTable({
  country,
  filter,
  statuses,
  groups,
  ruleEdits,
  cancelledSchedules,
  onStatusSelect,
  onEdit,
}: {
  groups: RuleGroup[]
  country: "All countries" | Country
  filter: StateFilter
  statuses: Record<string, Status>
  ruleEdits?: Record<string, RuleEdits>
  cancelledSchedules: Record<string, boolean>
  onStatusSelect: (rule: Rule, status: Status) => void
  onEdit: (rule: Rule) => void
}) {
  const [openStatusId, setOpenStatusId] = useState<string | null>(null)
  const [statusMenuBottom, setStatusMenuBottom] = useState<number | null>(null)
  const resolvedRuleEdits = ruleEdits ?? {}

  useEffect(() => {
    if (!openStatusId) return
    const closeMenu = () => setOpenStatusId(null)
    window.addEventListener("click", closeMenu)
    return () => window.removeEventListener("click", closeMenu)
  }, [openStatusId])

  const visibleGroups = useMemo(
    () =>
      groups
        .map((group) => ({
          ...group,
          rules: group.rules
            .map((rule) => withoutCancelledSchedule(rule, cancelledSchedules))
            .filter((rule) => {
              const status = statuses[rule.id] ?? rule.status
              const countries = scopeCountries(
                resolvedRuleEdits[rule.id]?.countries ?? rule.countries,
                resolvedRuleEdits[rule.id]?.locations,
              )
              const countryMatches =
                country === "All countries" || countries.includes(country)
              const stateMatches =
                filter === "Any state" ||
                (filter === "Statutory" && rule.statutory) ||
                (filter === "Scheduled changes" && rule.scheduled) ||
                status === filter.toLowerCase()
              return countryMatches && stateMatches
            }),
        }))
        .filter((group) => group.rules.length > 0),
    [cancelledSchedules, country, filter, groups, resolvedRuleEdits, statuses],
  )

  if (visibleGroups.length === 0) {
    return (
      <div className="empty-state">
        No rules match these filters. Try another country or state.
      </div>
    )
  }

  return (
    <div className="table-scroll">
      <div className="rules-table" role="table" aria-label="Working time rules">
        <div className="table-header table-grid" role="row">
          <span>Rule</span>
          <span>Status</span>
          <span>Applies to</span>
          <span>Effective</span>
          <span className="whitespace-nowrap">Last change</span>
          <span />
        </div>
        {visibleGroups.map((group) => (
          <div key={group.title} role="rowgroup">
            <div className="group-heading">
              <strong>{group.title}</strong>
              <span>{group.description}</span>
            </div>
            {group.rules.map((rule) => {
              const status = statuses[rule.id] ?? rule.status
              const isYoungWorkers = rule.id === "young-workers"
              const countries =
                resolvedRuleEdits[rule.id]?.countries ?? rule.countries
              const edit = resolvedRuleEdits[rule.id]
              const effective =
                edit?.takesEffect === "now"
                  ? "Live"
                  : edit?.effectiveDate
                    ? formatEffectiveDate(edit.effectiveDate)
                    : rule.effective
              return (
                <div
                  className={`rule-row table-grid edge-${status}`}
                  role="row"
                  key={rule.id}
                >
                  <div className="rule-name" role="cell">
                    <strong>{rule.name}</strong>
                    {(rule.statutory || isYoungWorkers) && (
                      <div className="tags">
                        {rule.statutory && <span>STATUTORY</span>}
                        {isYoungWorkers && <span>Locked</span>}
                      </div>
                    )}
                    <p>{rule.description}</p>
                  </div>
                  <div
                    className="status-cell"
                    role="cell"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <StatusBadge
                      status={status}
                      dropdown={!isYoungWorkers}
                      wide={isYoungWorkers}
                      onClick={
                        isYoungWorkers
                          ? undefined
                          : (event) => {
                              // Open upwards when the table would clip the menu
                              const button = event.currentTarget
                              const cell = button.parentElement!
                              const container =
                                button.closest(".table-scroll") ?? document.body
                              const spaceBelow =
                                Math.min(
                                  container.getBoundingClientRect().bottom,
                                  window.innerHeight,
                                ) - button.getBoundingClientRect().bottom
                              setStatusMenuBottom(
                                spaceBelow < 200
                                  ? cell.offsetHeight - button.offsetTop + 6
                                  : null,
                              )
                              setOpenStatusId((current) =>
                                current === rule.id ? null : rule.id,
                              )
                            }
                      }
                    />
                    {!isYoungWorkers && openStatusId === rule.id && (
                      <div
                        className="status-menu"
                        style={
                          statusMenuBottom === null
                            ? undefined
                            : { top: "auto", bottom: statusMenuBottom }
                        }
                        role="menu"
                        aria-label={`Choose status for ${rule.name}`}
                      >
                        {(["off", "warn", "block"] as Status[]).map(
                          (option) => (
                            <button
                              key={option}
                              className={status === option ? "selected" : ""}
                              disabled={
                                (rule.locked && option === "off") ||
                                (rule.id === "weekly-hours" &&
                                  option === "block")
                              }
                              onClick={() => {
                                setOpenStatusId(null)
                                if (status !== option) {
                                  onStatusSelect(rule, option)
                                }
                              }}
                              role="menuitem"
                            >
                              <StatusBadge status={option} />
                              <span>
                                {option === "off"
                                  ? "Do not check this rule"
                                  : option === "warn"
                                    ? "Warn, but allow publishing"
                                    : "Prevent saving the shift"}
                              </span>
                            </button>
                          ),
                        )}
                      </div>
                    )}
                    {rule.lockNote && !isYoungWorkers && (
                      <span className="lock-note">
                        <img src={asset("393b3.svg")} alt="" />
                        {rule.lockNote}
                      </span>
                    )}
                    {rule.notice && (
                      <span
                        className={`schedule-note${
                          rule.scheduled ? " schedule-note-scheduled" : ""
                        }`}
                      >
                        <img
                          src={asset(
                            rule.scheduled ? "cl897.svg" : "f5ea0.svg",
                          )}
                          alt=""
                        />
                        {rule.notice}
                      </span>
                    )}
                  </div>
                  <div className="applies-cell" role="cell">
                    {formatLocations(countries, edit?.locations)}
                    {formatEmployeeGroups(edit?.employeeGroups) && (
                      <small>{formatEmployeeGroups(edit?.employeeGroups)}</small>
                    )}
                  </div>
                  <strong
                    className={effective === "Live" ? "live" : "upcoming"}
                    role="cell"
                  >
                    {effective}
                  </strong>
                  <div className="last-change" role="cell">
                    <span>{rule.lastChange}</span>
                    <span>{rule.changedBy}</span>
                  </div>
                  <div role="cell">
                    <button
                      className="edit-button"
                      onClick={() => onEdit(rule)}
                    >
                      Edit
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

function ActivityTable({
  country,
  filter,
  statuses,
  groups,
  ruleEdits,
  cancelledSchedules,
}: {
  groups: RuleGroup[]
  country: "All countries" | Country
  filter: StateFilter
  statuses: Record<string, Status>
  ruleEdits?: Record<string, RuleEdits>
  cancelledSchedules: Record<string, boolean>
}) {
  const resolvedRuleEdits = ruleEdits ?? {}
  const rules = groups
    .flatMap((group) => group.rules)
    .map((rule) => withoutCancelledSchedule(rule, cancelledSchedules))
    .filter((rule) => {
      const status = statuses[rule.id] ?? rule.status
      const countries = scopeCountries(
        resolvedRuleEdits[rule.id]?.countries ?? rule.countries,
        resolvedRuleEdits[rule.id]?.locations,
      )
      return (
        (country === "All countries" || countries.includes(country)) &&
        (filter === "Any state" ||
          (filter === "Statutory" && rule.statutory) ||
          (filter === "Scheduled changes" && rule.scheduled) ||
          status === filter.toLowerCase())
      )
    })
    .sort(
      (a, b) => lastChangeValue(b.lastChange) - lastChangeValue(a.lastChange),
    )

  return (
    <div className="activity-list" aria-label="Rule activity">
      {rules.length ? (
        rules.map((rule) => (
          <div className="activity-row" key={rule.id}>
            <div>
              <strong>{rule.name}</strong>
              <span>
                {rule.changedBy} updated this rule to{" "}
                <b>{statuses[rule.id] ?? rule.status}</b>
              </span>
            </div>
            <time>{rule.lastChange}</time>
          </div>
        ))
      ) : (
        <div className="empty-state">No activity matches these filters.</div>
      )}
    </div>
  )
}

function EditRuleDialog({
  rule,
  status,
  edits,
  onClose,
  onSave,
  onCancelSchedule,
  firstTime = false,
}: {
  rule: Rule
  status: Status
  edits?: RuleEdits
  onClose: () => void
  onSave: (status: Status, edits: RuleEdits) => void
  onCancelSchedule: () => void
  firstTime?: boolean
}) {
  const [draftStatus, setDraftStatus] = useState(status)
  const [draftCountries, setDraftCountries] = useState<Country[]>(
    edits?.countries ?? rule.countries,
  )
  const [draftLocations, setDraftLocations] = useState<string[]>(
    edits?.locations ?? ["All locations"],
  )
  const [draftEmployeeGroups, setDraftEmployeeGroups] = useState<string[]>(
    edits?.employeeGroups ?? ["All employees"],
  )
  const [scopeTab, setScopeTab] =
    useState<"Country" | "Location" | "Employee group">("Country")
  const [takesEffect, setTakesEffect] = useState<"now" | "date">(
    edits?.takesEffect ?? (rule.effective === "Live" ? "now" : "date"),
  )
  const [effectiveDate, setEffectiveDate] = useState(
    edits?.effectiveDate ??
      parseEffectiveDate(rule.effective) ??
      new Date().toISOString().slice(0, 10),
  )
  const [showHistory, setShowHistory] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [showCancelSchedule, setShowCancelSchedule] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)
  const groupName =
    initialGroups.find((group) =>
      group.rules.some((candidate) => candidate.id === rule.id),
    )?.title ?? "Working time rule"
  const responseCopy: Record<Status, { title: string; detail: string }> = {
    off: {
      title: "Rule switched off",
      detail:
        "Rotageek will not check this rule when managers schedule a shift.",
    },
    warn: {
      title: "What schedulers will see",
      detail:
        "When a shift breaks this rule, the scheduler sees a warning. Managers can still publish the shift.",
    },
    block: {
      title: "What schedulers will see",
      detail:
        "When a shift breaks this rule, the scheduler sees a red error on the shift. The shift cannot be saved or published until the issue is fixed.",
    },
  }
  const locationOptions = [
    "All locations",
    ...Object.keys(locationCountries).filter((location) =>
      draftCountries.includes(locationCountries[location]),
    ),
  ]
  const employeeGroupOptions = [
    "All employees",
    "Young workers",
    "Night workers",
  ]
  const originalScope = formatScope(
    edits?.countries ?? rule.countries,
    edits?.locations,
    edits?.employeeGroups,
  )
  const draftScope = formatScope(
    draftCountries,
    draftLocations,
    draftEmployeeGroups,
  )
  const scopeChanged = originalScope !== draftScope
  const impact = formatImpact(
    draftCountries,
    draftLocations,
    draftEmployeeGroups,
  )
  const acknowledgementCopy: Record<Status, string> = {
    off: "I understand this rule will no longer be checked.",
    warn: "I understand schedulers will see a warning but can still publish.",
    block:
      "I understand schedulers will not be able to save shifts that break this rule.",
  }
  // "3/9/25" (day/month/year) -> Date, for ordering and display
  const lastChangeDate = (() => {
    const [day, month, year] = rule.lastChange.split("/").map(Number)
    return new Date(2000 + year, month - 1, day)
  })()
  const formatHistoryDate = (date: Date) =>
    `${date.getDate()} ${
      [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ][date.getMonth()]
    } ${date.getFullYear()}`
  const coversRoi = rule.countries.includes("ROI")
  const coversBoth = coversRoi && rule.countries.includes("UK")
  // Sample past changes; only those that happened before the latest change
  // and that fit this rule's scope are shown
  const pastChanges = [
    {
      date: new Date(2026, 1, 4),
      author: "Tom Reilly",
      title: "Response: Block → Warn",
      detail: "Agreed with HR to review the rule in March.",
    },
    {
      date: new Date(2026, 0, 9),
      author: "Priya Shah",
      title: "Response: Warn → Block",
      detail: "New policy from HR director, ref POL-031.",
    },
    ...(coversBoth
      ? [
          {
            date: new Date(2025, 11, 2),
            author: "Priya Shah",
            title: "Applies to: added ROI",
            detail: "Dublin and Cork sites opened.",
          },
        ]
      : []),
  ].filter((entry) => !firstTime && entry.date < lastChangeDate)
  const addedRoiLater = pastChanges.some((entry) =>
    entry.title.startsWith("Applies to"),
  )
  const historyEntries = [
    {
      date: formatHistoryDate(lastChangeDate),
      author: rule.changedBy,
      title: `Current response: ${status}`,
      detail: "Latest saved rule configuration.",
      current: true,
    },
    ...pastChanges.map((entry) => ({
      ...entry,
      date: formatHistoryDate(entry.date),
      current: false,
    })),
    {
      date: "14 Nov 2024",
      author: "Rotageek onboarding",
      title: `Rule created: ${rule.status}, ${
        addedRoiLater ? "All UK locations" : rule.appliesTo
      }`,
      detail: "Initial setup.",
      current: false,
    },
  ]

  const toggleCountry = (country: Country) => {
    if (rule.locked) return
    setDraftCountries((current) => {
      if (current.includes(country)) {
        if (current.length === 1) return current
        // Drop locations that belong to the removed country
        setDraftLocations((locations) => {
          const kept = locations.filter(
            (location) => locationCountries[location] !== country,
          )
          return kept.length ? kept : ["All locations"]
        })
        return current.filter((item) => item !== country)
      }
      return [...current, country]
    })
  }

  const toggleSelection = (
    value: string,
    values: string[],
    setValues: (values: string[]) => void,
  ) => {
    if (rule.locked) return
    // "All …" is exclusive: picking it clears the rest, picking anything else clears it
    const allOption = values === draftLocations ? "All locations" : "All employees"
    if (value === allOption) {
      setValues([allOption])
    } else if (values.includes(value)) {
      const remaining = values.filter((item) => item !== value)
      setValues(remaining.length ? remaining : [allOption])
    } else {
      setValues([...values.filter((item) => item !== allOption), value])
    }
  }

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      if (showCancelSchedule) {
        setShowCancelSchedule(false)
      } else if (showConfirmation) {
        setShowConfirmation(false)
        setAcknowledged(false)
      } else if (showHistory) {
        setShowHistory(false)
      } else {
        onClose()
      }
    }
    document.body.style.overflow = "hidden"
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [onClose, showCancelSchedule, showConfirmation, showHistory])

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <aside
        className="edit-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-rule-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="drawer-header">
          <button className="mobile-back-button" onClick={onClose}>
            ‹ Back to rules
          </button>
          <div className="drawer-meta-row">
            <div className="drawer-meta">
              {rule.statutory && <span className="drawer-tag">STATUTORY</span>}
              <span>{groupName}</span>
            </div>
            <div className="drawer-header-actions">
              <button
                className="history-button"
                onClick={() => setShowHistory((visible) => !visible)}
                aria-pressed={showHistory}
              >
                History
              </button>
              <button
                className="drawer-close"
                onClick={onClose}
                aria-label="Close editor"
              >
                ×
              </button>
            </div>
          </div>
          <h2 id="edit-rule-title">{rule.name}</h2>
          <p>{rule.description}</p>
          {rule.scheduled && rule.notice && (
            <div className="drawer-schedule-banner">
              <img src={asset("cl897.svg")} alt="" />
              <span>
                <strong>{rule.notice}</strong>
                <small>
                  Cancel the scheduled change to keep this rule on {status}.
                </small>
              </span>
            </div>
          )}
        </header>

        <div className="drawer-content">
          <section className="drawer-section">
            <h3>How Rotageek should respond</h3>
            <div className="dialog-options">
              {(["off", "warn", "block"] as Status[]).map((option) => {
                const descriptions: Record<Status, string> = {
                  off: "Rotageek does not check this rule",
                  warn: "Managers are warned but can still publish",
                  block: "The shift cannot be saved until fixed",
                }
                return (
                  <button
                    key={option}
                    className={`${
                      draftStatus === option ? "selected" : ""
                    } option-${option}`}
                    onClick={() => setDraftStatus(option)}
                    disabled={
                      (rule.locked && option === "off") ||
                      (rule.id === "weekly-hours" && option === "block") ||
                      (rule.id === "young-workers" && option !== "block")
                    }
                    aria-pressed={draftStatus === option}
                  >
                    <StatusBadge status={option} />
                    <strong>{option}</strong>
                    <span>{descriptions[option]}</span>
                  </button>
                )
              })}
            </div>
            {rule.locked && (
              <span className="drawer-lock-note">
                <img src={asset("393b3.svg")} alt="" />
                {rule.lockNote}
              </span>
            )}
            <div className={`response-preview preview-${draftStatus}`}>
              <strong>{responseCopy[draftStatus].title}</strong>
              <p>{responseCopy[draftStatus].detail}</p>
            </div>
          </section>

          <section className="drawer-section">
            <h3>Who this applies to</h3>
            <div className="scope-tabs" role="tablist">
              {(["Country", "Location", "Employee group"] as const).map(
                (item) => (
                  <button
                    key={item}
                    className={scopeTab === item ? "current" : ""}
                    onClick={() => setScopeTab(item)}
                    role="tab"
                    aria-selected={scopeTab === item}
                  >
                    {item}
                  </button>
                ),
              )}
            </div>
            {scopeTab === "Country" ? (
              <div className="country-options">
                <label
                  className={draftCountries.includes("UK") ? "selected" : ""}
                >
                  <input
                    type="checkbox"
                    checked={draftCountries.includes("UK")}
                    onChange={() => toggleCountry("UK")}
                    disabled={rule.locked}
                  />
                  <span>
                    <strong>United Kingdom</strong>
                    <small>38 locations · 1,240 employees</small>
                  </span>
                </label>
                <label
                  className={draftCountries.includes("ROI") ? "selected" : ""}
                >
                  <input
                    type="checkbox"
                    checked={draftCountries.includes("ROI")}
                    onChange={() => toggleCountry("ROI")}
                    disabled={rule.locked}
                  />
                  <span>
                    <strong>Republic of Ireland</strong>
                    <small>12 locations · 420 employees</small>
                  </span>
                </label>
              </div>
            ) : scopeTab === "Location" ? (
              <div className="scope-choice-list">
                {locationOptions.map((location) => (
                  <label
                    key={location}
                    className={
                      draftLocations.includes(location) ? "selected" : ""
                    }
                  >
                    <input
                      type="checkbox"
                      checked={draftLocations.includes(location)}
                      onChange={() =>
                        toggleSelection(
                          location,
                          draftLocations,
                          setDraftLocations,
                        )
                      }
                      disabled={rule.locked}
                    />
                    <span>{location}</span>
                  </label>
                ))}
              </div>
            ) : (
              <div className="scope-choice-list">
                {employeeGroupOptions.map((group) => (
                  <label
                    key={group}
                    className={
                      draftEmployeeGroups.includes(group) ? "selected" : ""
                    }
                  >
                    <input
                      type="checkbox"
                      checked={draftEmployeeGroups.includes(group)}
                      onChange={() =>
                        toggleSelection(
                          group,
                          draftEmployeeGroups,
                          setDraftEmployeeGroups,
                        )
                      }
                      disabled={rule.locked}
                    />
                    <span>{group}</span>
                  </label>
                ))}
              </div>
            )}
            <div className="selected-scope">
              Selected: <strong>{draftScope}</strong>
            </div>
            <div className="impact-summary">Affects {impact}</div>
          </section>

          <section className="drawer-section">
            <h3>When this takes effect</h3>
            <div className="effect-options">
              <button
                className={takesEffect === "now" ? "selected" : ""}
                onClick={() => setTakesEffect("now")}
                disabled={rule.locked}
              >
                <span className="radio-dot" />
                <span>
                  <strong>Now</strong>
                  <small>As soon as you confirm</small>
                </span>
              </button>
              <button
                className={takesEffect === "date" ? "selected" : ""}
                onClick={() => setTakesEffect("date")}
                disabled={rule.locked}
              >
                <span className="radio-dot" />
                <span>
                  <strong>On a date</strong>
                  <small>Applies to shifts on or after this date</small>
                </span>
              </button>
            </div>
            {takesEffect === "date" && (
              <label className="date-picker-field">
                <span>Effective date</span>
                <input
                  type="date"
                  value={effectiveDate}
                  onChange={(event) => setEffectiveDate(event.target.value)}
                  disabled={rule.locked}
                />
              </label>
            )}
          </section>
        </div>

        <footer className="dialog-actions">
          <button onClick={onClose}>Cancel</button>
          {rule.scheduled && draftStatus === status ? (
            <button
              className="save-button"
              onClick={() => setShowCancelSchedule(true)}
            >
              Cancel scheduled change
            </button>
          ) : (
            <button
              className="save-button"
              onClick={() => setShowConfirmation(true)}
            >
              Review changes
            </button>
          )}
        </footer>
      </aside>
      {showHistory && (
        <aside
          className="edit-dialog history-drawer"
          role="dialog"
          aria-modal="true"
          aria-labelledby="history-title"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <header className="history-header">
            <div>
              <span>Change history</span>
              <h2 id="history-title">{rule.name}</h2>
            </div>
            <button
              className="drawer-close"
              onClick={() => setShowHistory(false)}
              aria-label="Close history"
            >
              ×
            </button>
          </header>
          <div className="history-list">
            {historyEntries.map((entry) => (
              <article
                key={`${entry.date}-${entry.title}`}
                className={entry.current ? "current" : ""}
              >
                <span className="history-dot" />
                <div>
                  <p>
                    {entry.date} · <strong>{entry.author}</strong>
                  </p>
                  <h3>{entry.title}</h3>
                  <span>{entry.detail}</span>
                </div>
              </article>
            ))}
          </div>
          <footer className="history-footer">
            <button
              onClick={() =>
                window.alert("The full audit log will be available here.")
              }
            >
              Open full audit log
            </button>
            <span>OUT OF SCOPE</span>
          </footer>
        </aside>
      )}
      {showConfirmation && (
        <div
          className="confirmation-layer"
          role="presentation"
          onMouseDown={(event) => {
            event.stopPropagation()
            setShowConfirmation(false)
            setAcknowledged(false)
          }}
        >
          <section
            className="confirmation-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirmation-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 id="confirmation-title">Review and confirm</h2>
            <p>Check what changes and who it affects before you confirm.</p>

            <dl className="confirmation-summary">
              <div>
                <dt>Rule</dt>
                <dd>{rule.name}</dd>
              </div>
              <div>
                <dt>Response</dt>
                <dd className="confirmation-response">
                  <span className="capitalize">{status}</span>
                  {status !== draftStatus && <span>changing to</span>}
                  <StatusBadge status={draftStatus} />
                </dd>
              </div>
              <div>
                <dt>Applies to</dt>
                <dd>
                  {draftScope}
                  <span className="summary-note">
                    {scopeChanged ? "updated" : "unchanged"}
                  </span>
                </dd>
              </div>
              <div>
                <dt>Takes effect</dt>
                <dd>
                  {takesEffect === "now"
                    ? "Immediately"
                    : formatEffectiveDate(effectiveDate)}
                </dd>
              </div>
              <div>
                <dt>Impact</dt>
                <dd>
                  {impact} will see{" "}
                  {draftStatus === "block" ? "blocks" : draftStatus}
                </dd>
              </div>
            </dl>

            <label className="confirmation-acknowledgement">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
              />
              <span>{acknowledgementCopy[draftStatus]}</span>
            </label>

            <div className="confirmation-actions">
              <button
                onClick={() => {
                  setShowConfirmation(false)
                  setAcknowledged(false)
                }}
              >
                Back
              </button>
              <button
                className="confirm-button"
                disabled={!acknowledged}
                onClick={() =>
                  onSave(draftStatus, {
                    countries: draftCountries,
                    locations: draftLocations,
                    employeeGroups: draftEmployeeGroups,
                    takesEffect,
                    effectiveDate:
                      takesEffect === "date" ? effectiveDate : undefined,
                  })
                }
              >
                Confirm change
              </button>
            </div>
          </section>
        </div>
      )}
      {showCancelSchedule && (
        <div
          className="confirmation-layer"
          role="presentation"
          onMouseDown={(event) => {
            event.stopPropagation()
            setShowCancelSchedule(false)
          }}
        >
          <section
            className="confirmation-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="cancel-schedule-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 id="cancel-schedule-title">Cancel scheduled change?</h2>
            <p>The rule will stay as it is now. You can schedule it again later.</p>

            <dl className="confirmation-summary">
              <div>
                <dt>Rule</dt>
                <dd>{rule.name}</dd>
              </div>
              <div>
                <dt>Scheduled change</dt>
                <dd>{rule.notice}</dd>
              </div>
              <div>
                <dt>Response</dt>
                <dd className="confirmation-response">
                  <span>Stays on</span>
                  <StatusBadge status={status} />
                </dd>
              </div>
              <div>
                <dt>Applies to</dt>
                <dd>
                  {originalScope}
                  <span className="summary-note">unchanged</span>
                </dd>
              </div>
            </dl>

            <div className="confirmation-actions">
              <button onClick={() => setShowCancelSchedule(false)}>Back</button>
              <button className="confirm-button" onClick={onCancelSchedule}>
                Cancel scheduled change
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

function QuickStatusConfirmation({
  rule,
  currentStatus,
  nextStatus,
  edits,
  onBack,
  onConfirm,
}: {
  rule: Rule
  currentStatus: Status
  nextStatus: Status
  edits?: RuleEdits
  onBack: () => void
  onConfirm: () => void
}) {
  const [acknowledged, setAcknowledged] = useState(false)
  const countries = edits?.countries ?? rule.countries
  const impact = formatImpact(
    countries,
    edits?.locations,
    edits?.employeeGroups,
  )
  const acknowledgementCopy: Record<Status, string> = {
    off: "I understand this rule will no longer be checked.",
    warn: "I understand schedulers will see a warning but can still publish.",
    block:
      "I understand schedulers will not be able to save shifts that break this rule.",
  }

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onBack()
    }
    document.body.style.overflow = "hidden"
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [onBack])

  return (
    <div
      className="confirmation-layer quick-confirmation-layer"
      role="presentation"
      onMouseDown={onBack}
    >
      <section
        className="confirmation-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="quick-confirmation-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="quick-confirmation-title">Review and confirm</h2>
        <p>Check the status change and who it affects before you confirm.</p>

        <dl className="confirmation-summary">
          <div>
            <dt>Rule</dt>
            <dd>{rule.name}</dd>
          </div>
          <div>
            <dt>Response</dt>
            <dd className="confirmation-response">
              <span className="capitalize">{currentStatus}</span>
              <span>changing to</span>
              <StatusBadge status={nextStatus} />
            </dd>
          </div>
          <div>
            <dt>Applies to</dt>
            <dd>
              {formatScope(countries, edits?.locations, edits?.employeeGroups)}
              <span className="summary-note">unchanged</span>
            </dd>
          </div>
          <div>
            <dt>Takes effect</dt>
            <dd>Immediately</dd>
          </div>
          <div>
            <dt>Impact</dt>
            <dd>
              {impact} will see {nextStatus === "block" ? "blocks" : nextStatus}
            </dd>
          </div>
        </dl>

        <label className="confirmation-acknowledgement">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
          />
          <span>{acknowledgementCopy[nextStatus]}</span>
        </label>

        <div className="confirmation-actions">
          <button onClick={onBack}>Back</button>
          <button
            className="confirm-button"
            disabled={!acknowledged}
            onClick={onConfirm}
          >
            Confirm change
          </button>
        </div>
      </section>
    </div>
  )
}

function SuccessToast({
  change,
  onUndo,
  onClose,
}: {
  change: SavedChange
  onUndo: () => void
  onClose: () => void
}) {
  useEffect(() => {
    const timeout = window.setTimeout(onClose, 8000)
    return () => window.clearTimeout(timeout)
  }, [onClose])

  const timing =
    !change.statusOnly &&
    change.edits.takesEffect === "date" &&
    change.edits.effectiveDate
      ? ` from ${formatEffectiveDate(change.edits.effectiveDate)}`
      : ""
  const scope =
    !change.statusOnly &&
    (hasSpecificLocations(change.edits.locations) ||
      hasSpecificGroups(change.edits.employeeGroups))
      ? ` for ${formatScope(
          change.edits.countries,
          change.edits.locations,
          change.edits.employeeGroups,
        )}`
      : ""

  return (
    <div className="success-toast" role="status">
      <span className="success-icon">✓</span>
      {change.cancelledSchedule ? (
        <span>
          Scheduled change cancelled. {change.rule.name} stays on{" "}
          <strong className="capitalize">{change.status}</strong>.
        </span>
      ) : (
        <span>
          {change.rule.name} set to{" "}
          <strong className="capitalize">{change.status}</strong>
          {scope}
          {timing}.
        </span>
      )}
      <button className="undo-button" onClick={onUndo}>
        Undo
      </button>
      <button className="toast-close" onClick={onClose} aria-label="Dismiss">
        ×
      </button>
    </div>
  )
}

function PrototypeToggle({
  firstTime,
  onChange,
}: {
  firstTime: boolean
  onChange: (firstTime: boolean) => void
}) {
  return (
    <div className="prototype-toggle" role="group" aria-label="Prototype state">
      {([false, true] as const).map((value) => (
        <button
          key={String(value)}
          className={firstTime === value ? "current" : ""}
          onClick={() => onChange(value)}
          aria-pressed={firstTime === value}
        >
          {value ? "First-time user" : "Returning user"}
        </button>
      ))}
    </div>
  )
}

function App() {
  const [firstTime, setFirstTime] = useState(false)
  const groups = firstTime ? firstTimeGroups : initialGroups
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [tab, setTab] = useState<"Rules" | "Activities">("Rules")
  const [country, setCountry] = useState<"All countries" | Country>(
    "All countries",
  )
  const [filter, setFilter] = useState<StateFilter>("Any state")
  const [statuses, setStatuses] = useState<Record<string, Status>>({})
  const [ruleEdits, setRuleEdits] = useState<Record<string, RuleEdits>>({})
  const [editingRule, setEditingRule] = useState<Rule | null>(null)
  const [cancelledSchedules, setCancelledSchedules] =
    useState<Record<string, boolean>>({})
  const [changeMeta, setChangeMeta] = useState<Record<string, ChangeMeta>>({})
  // Rules carry who changed them last, including changes made in this session
  const displayGroups = useMemo(
    () =>
      groups.map((group) => ({
        ...group,
        rules: group.rules.map((rule) =>
          changeMeta[rule.id] ? { ...rule, ...changeMeta[rule.id] } : rule,
        ),
      })),
    [changeMeta, groups],
  )
  const recordChange = (ruleId: string) =>
    setChangeMeta((values) => ({
      ...values,
      [ruleId]: { lastChange: todayShort(), changedBy: currentUser },
    }))
  const [lastSavedChange, setLastSavedChange] = useState<SavedChange | null>(
    null,
  )
  const [mobileLegendOpen, setMobileLegendOpen] = useState(false)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const [pendingStatusChange, setPendingStatusChange] = useState<{
    rule: Rule
    status: Status
  } | null>(null)
  const resolvedRuleEdits = ruleEdits ?? {}
  const filters: StateFilter[] = [
    "Any state",
    "Block",
    "Warn",
    "Off",
    "Statutory",
    "Scheduled changes",
  ]

  const confirmQuickStatusChange = () => {
    if (!pendingStatusChange) return
    const { rule, status } = pendingStatusChange
    const existingEdits = resolvedRuleEdits[rule.id]
    setLastSavedChange({
      rule,
      status,
      statusOnly: true,
      edits: existingEdits ?? {
        countries: rule.countries,
        locations: ["All locations"],
        employeeGroups: ["All employees"],
        takesEffect: "now",
      },
      previousStatus: statuses[rule.id] ?? rule.status,
      previousEdits: existingEdits,
      previousMeta: changeMeta[rule.id],
    })
    recordChange(rule.id)
    setStatuses((values) => ({ ...(values ?? {}), [rule.id]: status }))
    setPendingStatusChange(null)
  }

  const saveRule = (status: Status, edits: RuleEdits) => {
    if (!editingRule) return
    setLastSavedChange({
      rule: editingRule,
      status,
      edits,
      previousStatus: statuses[editingRule.id] ?? editingRule.status,
      previousEdits: resolvedRuleEdits[editingRule.id],
      previousMeta: changeMeta[editingRule.id],
    })
    recordChange(editingRule.id)
    setStatuses((values) => ({ ...values, [editingRule.id]: status }))
    setRuleEdits((values) => ({
      ...(values ?? {}),
      [editingRule.id]: edits,
    }))
    setEditingRule(null)
  }

  const switchUserState = (value: boolean) => {
    if (value === firstTime) return
    setFirstTime(value)
    setStatuses({})
    setRuleEdits({})
    setCancelledSchedules({})
    setChangeMeta({})
    setEditingRule(null)
    setLastSavedChange(null)
    setPendingStatusChange(null)
    setFilter("Any state")
  }

  const scheduledCount = displayGroups
    .flatMap((group) => group.rules)
    .filter((rule) => rule.scheduled && !cancelledSchedules[rule.id]).length

  const cancelSchedule = () => {
    if (!editingRule) return
    const status = statuses[editingRule.id] ?? editingRule.status
    setCancelledSchedules((values) => ({ ...values, [editingRule.id]: true }))
    setLastSavedChange({
      rule: editingRule,
      status,
      edits: resolvedRuleEdits[editingRule.id] ?? {
        countries: editingRule.countries,
        locations: ["All locations"],
        employeeGroups: ["All employees"],
        takesEffect: "now",
      },
      previousStatus: status,
      previousEdits: resolvedRuleEdits[editingRule.id],
      cancelledSchedule: true,
      previousMeta: changeMeta[editingRule.id],
    })
    recordChange(editingRule.id)
    setEditingRule(null)
  }

  const undoLastChange = () => {
    if (!lastSavedChange) return
    const { rule, previousStatus, previousEdits, previousMeta } =
      lastSavedChange
    setChangeMeta((values) => {
      const next = { ...values }
      if (previousMeta) next[rule.id] = previousMeta
      else delete next[rule.id]
      return next
    })
    if (lastSavedChange.cancelledSchedule) {
      setCancelledSchedules((values) => {
        const next = { ...values }
        delete next[rule.id]
        return next
      })
      setLastSavedChange(null)
      return
    }
    setStatuses((values) => ({
      ...(values ?? {}),
      [rule.id]: previousStatus,
    }))
    setRuleEdits((values) => {
      const next = { ...(values ?? {}) }
      if (previousEdits) next[rule.id] = previousEdits
      else delete next[rule.id]
      return next
    })
    setLastSavedChange(null)
  }

  return (
    <div className="app-shell">
      <header className="desktop-topbar">
        <Brand />
        <PrototypeToggle firstTime={firstTime} onChange={switchUserState} />
        <div className="topbar-context">
          <div className="topbar-profile">
            <img src={asset("mobile-profile.png")} alt="" />
            <span>
              <strong>C. Moreno</strong>
              <small>Compliance Admin</small>
            </span>
          </div>
        </div>
      </header>
      <header className="mobile-topbar">
        <button
          className="mobile-menu-button"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open navigation"
        >
          <span />
          <span />
          <span />
        </button>
        <Brand />
        <PrototypeToggle firstTime={firstTime} onChange={switchUserState} />
        <img
          className="mobile-avatar"
          src={asset("mobile-profile.png")}
          alt="Priya Shah"
        />
      </header>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main>
        <header className="page-header">
          <button
            className="menu-button"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation"
          >
            <span />
            <span />
            <span />
          </button>
          <span className="mobile-breadcrumb">Settings / Compliance</span>
          <h1>
            <span className="desktop-heading">Working time directives</span>
            <span className="mobile-heading">Working time rules</span>
          </h1>
          <p className="desktop-subtitle">
            Control which working time rules Rotageek checks when shifts are
            scheduled.
          </p>
          <p className="mobile-subtitle">
            Control which rules Rotageek checks when shifts are scheduled.
          </p>
          <div className="tabs" role="tablist">
            {(["Rules", "Activities"] as const).map((item) => (
              <button
                key={item}
                className={tab === item ? "current" : ""}
                onClick={() => setTab(item)}
                role="tab"
                aria-selected={tab === item}
              >
                {item}
              </button>
            ))}
            {scheduledCount > 0 && (
              <button
                className="scheduled"
                onClick={() => {
                  setTab("Rules")
                  setFilter("Scheduled changes")
                }}
              >
                {scheduledCount} SCHEDULED
              </button>
            )}
          </div>
        </header>

        <div className="page-content">
          {firstTime && (
            <div className="first-time-banner">
              <img src={asset("f5ea0.svg")} alt="" />
              <span>
                <strong>These are Rotageek's recommended defaults</strong>
                <small>
                  Rules are set up for UK and ROI working time law. Review each
                  rule and adjust how Rotageek responds to match your policies.
                </small>
              </span>
            </div>
          )}
          <UnderstandingRules
            mobileOpen={mobileLegendOpen}
            onToggle={() => setMobileLegendOpen((open) => !open)}
          />
          <div
            className={`filters ${
              mobileFiltersOpen ? "mobile-filters-open" : ""
            }`}
          >
            <div className="country-tabs">
              {(["All countries", "UK", "ROI"] as const).map((item) => (
                <button
                  key={item}
                  className={country === item ? "current" : ""}
                  onClick={() => setCountry(item)}
                  aria-pressed={country === item}
                >
                  {item}
                </button>
              ))}
            </div>
            <button
              className="mobile-filter-button"
              onClick={() => setMobileFiltersOpen((open) => !open)}
              aria-expanded={mobileFiltersOpen}
            >
              <span />
              Filters
            </button>
            <div className="filter-pills">
              {filters.map((item) => (
                <button
                  key={item}
                  className={filter === item ? "current" : ""}
                  onClick={() => setFilter(item)}
                  aria-pressed={filter === item}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
          {scheduledCount > 0 && (
            <button
              className="mobile-scheduled"
              onClick={() => {
                setTab("Rules")
                setFilter("Scheduled changes")
              }}
            >
              <span>
                {scheduledCount} change{scheduledCount === 1 ? "" : "s"}{" "}
                scheduled
              </span>
              <strong>Show</strong>
            </button>
          )}
          {tab === "Rules" ? (
            <RuleTable
              groups={displayGroups}
              country={country}
              filter={filter}
              statuses={statuses}
              ruleEdits={resolvedRuleEdits}
              cancelledSchedules={cancelledSchedules}
              onStatusSelect={(rule, status) =>
                setPendingStatusChange({ rule, status })
              }
              onEdit={setEditingRule}
            />
          ) : (
            <ActivityTable
              groups={displayGroups}
              country={country}
              filter={filter}
              statuses={statuses}
              ruleEdits={resolvedRuleEdits}
              cancelledSchedules={cancelledSchedules}
            />
          )}
        </div>
      </main>
      {editingRule && (
        <EditRuleDialog
          key={editingRule.id}
          rule={editingRule}
          status={statuses[editingRule.id] ?? editingRule.status}
          edits={resolvedRuleEdits[editingRule.id]}
          onClose={() => setEditingRule(null)}
          onSave={saveRule}
          onCancelSchedule={cancelSchedule}
          firstTime={firstTime}
        />
      )}
      {lastSavedChange && (
        <SuccessToast
          change={lastSavedChange}
          onUndo={undoLastChange}
          onClose={() => setLastSavedChange(null)}
        />
      )}
      {pendingStatusChange && (
        <QuickStatusConfirmation
          rule={pendingStatusChange.rule}
          currentStatus={
            statuses[pendingStatusChange.rule.id] ??
            pendingStatusChange.rule.status
          }
          nextStatus={pendingStatusChange.status}
          edits={resolvedRuleEdits[pendingStatusChange.rule.id]}
          onBack={() => setPendingStatusChange(null)}
          onConfirm={confirmQuickStatusChange}
        />
      )}
    </div>
  )
}

export default App
