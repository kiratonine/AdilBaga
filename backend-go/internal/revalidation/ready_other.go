//go:build !linux

package revalidation

import "context"
import "errors"
import "io"

func RequestReadyDetailed(_ context.Context, _, _ string) (*ReadyTicket, ReadyDiagnostic) {
	return nil, ReadyDiagnostic{phase: phaseUnsupported, reason: reasonUnsupported, outcome: outcomeNotArmed}
}
func PeerIdentity(_ int) (Peer, error)                        { return Peer{}, errors.New("unsupported") }
func RunReadyServer(_ string, _ io.Reader, _ io.Writer) error { return errors.New("unsupported") }
