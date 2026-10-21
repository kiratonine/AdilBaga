package revalidation

type Peer struct {
	PID              int    `json:"pid"`
	UID              int    `json:"uid"`
	GID              int    `json:"gid"`
	ExecutableSHA256 string `json:"executableSha256"`
	RootControlled   bool   `json:"rootControlled"`
	BootID           string `json:"bootId"`
}
