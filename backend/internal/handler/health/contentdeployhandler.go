package health

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"silan-backend/internal/contentdeploy"
	"silan-backend/internal/svc"

	"github.com/zeromicro/go-zero/rest/httpx"
)

const contentDeployMediaType = "application/vnd.silan.content-deploy+tar+gzip"

func ContentDeployHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.Header.Get("Content-Type"), contentDeployMediaType) {
			httpx.ErrorCtx(r.Context(), w, errors.New("content deploy requires a gzip bundle"))
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, svcCtx.Config.ContentDeployMaxBundleBytes())
		result, err := svcCtx.ContentDeploy.Deploy(r.Context(), r.Body)
		if err != nil {
			var mediaRequired *contentdeploy.MediaRequiredError
			if errors.As(err, &mediaRequired) {
				httpx.WriteJson(w, http.StatusConflict, contentdeploy.PlanResult{
					UploadPaths: mediaRequired.UploadPaths,
				})
				return
			}
			var tooLarge *http.MaxBytesError
			if errors.As(err, &tooLarge) {
				http.Error(w, "deployment bundle is too large", http.StatusRequestEntityTooLarge)
				return
			}
			http.Error(w, fmt.Sprintf("content deployment failed: %v", err), http.StatusUnprocessableEntity)
			return
		}
		httpx.OkJsonCtx(r.Context(), w, result)
	}
}
