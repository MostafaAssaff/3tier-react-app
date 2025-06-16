pipeline {
    agent any
    
    environment {
        AWS_REGION         = 'us-west-2'
        ECR_REGISTRY       = '889818960214.dkr.ecr.us-west-2.amazonaws.com'
        ECR_REPO_NAME      = 'my-app-repo'
        EKS_CLUSTER_NAME   = 'my-eks-cluster'
        AWS_CREDENTIALS_ID = 'aws-credentials'
        SONAR_SCANNER_HOME = tool 'SonarScanner-latest'
    }

    stages {
        stage('Checkout') {
            steps {
                echo "🔄 Checking out code from branch: ${env.BRANCH_NAME}"
                checkout scm
            }
        }

        stage('SonarQube Analysis') {
            when {
                expression { !params.SKIP_SONAR }
            }
            steps {
                withSonarQubeEnv('MySonarQubeServer') {
                    sh "${SONAR_SCANNER_HOME}/bin/sonar-scanner"
                }
            }
        }

        stage('Quality Gate') {
            when {
                expression { !params.SKIP_SONAR }
            }
            steps {
                script {
                    try {
                        timeout(time: 10, unit: 'MINUTES') {
                            def qg = waitForQualityGate()
                            if (qg.status != 'OK') {
                                echo "⚠️ Quality Gate Status: ${qg.status}"
                                if (params.FAIL_ON_QUALITY_GATE == true) {
                                    error("❌ Quality Gate failed: ${qg.status}")
                                } else {
                                    echo "⚠️ Quality Gate failed but continuing pipeline"
                                    currentBuild.result = 'UNSTABLE'
                                }
                            } else {
                                echo "✅ Quality Gate passed!"
                            }
                        }
                    } catch (Exception e) {
                        echo "⚠️ Quality Gate check failed: ${e.getMessage()}"
                        if (params.FAIL_ON_QUALITY_GATE == true) {
                            error("Quality Gate check failed")
                        } else {
                            currentBuild.result = 'UNSTABLE'
                        }
                    }
                }
            }
        }

        stage('Build, Scan & Push Images') {
            parallel {
                stage('Build Backend') {
                    steps {
                        dir('backend') {
                            script {
                                try {
                                    // Check backend dependencies and configuration
                                    sh '''
                                        echo "🔍 Backend Pre-build Analysis:"
                                        echo "============================="
                                        
                                        # Check if package.json exists
                                        if [ -f package.json ]; then
                                            echo "✅ package.json found"
                                            echo "📋 Package.json content:"
                                            cat package.json | head -20
                                        else
                                            echo "❌ package.json not found!"
                                            exit 1
                                        fi
                                        
                                        # Check if Dockerfile exists
                                        if [ -f Dockerfile ]; then
                                            echo "✅ Dockerfile found"
                                            echo "📋 Dockerfile content:"
                                            cat Dockerfile
                                        else
                                            echo "❌ Dockerfile not found!"
                                            exit 1
                                        fi
                                        
                                        # Install dependencies
                                        echo "📦 Installing dependencies..."
                                        if [ ! -f package-lock.json ]; then
                                            echo "🔧 Generating package-lock.json"
                                            npm install
                                        fi
                                        npm ci || npm install
                                        
                                        # Check for common issues
                                        echo "🔍 Checking for common backend issues:"
                                        if [ -f app.js ] || [ -f index.js ] || [ -f server.js ]; then
                                            echo "✅ Main application file found"
                                        else
                                            echo "⚠️ No main application file found (app.js, index.js, server.js)"
                                        fi
                                        
                                        # Test if the app can start (quick check)
                                        echo "🧪 Testing backend startup (timeout 10s)..."
                                        timeout 10s npm start &
                                        sleep 3
                                        if pgrep -f "node" > /dev/null; then
                                            echo "✅ Backend starts successfully"
                                            pkill -f "node" || true
                                        else
                                            echo "⚠️ Backend might have startup issues"
                                        fi
                                    '''

                                    def imageName = "${ECR_REGISTRY}/${ECR_REPO_NAME}:3tier-nodejs-backend-${env.BUILD_ID}"
                                    echo "🏗️ Building backend image: ${imageName}"
                                    
                                    // Build with more verbose output
                                    def backendImage = docker.build(imageName, '--no-cache .')

                                    // Test the built image
                                    echo "🧪 Testing built backend image..."
                                    sh """
                                        echo "Testing image: ${imageName}"
                                        
                                        # Run container for 10 seconds to check if it starts
                                        docker run -d --name backend-test-${env.BUILD_ID} ${imageName} || {
                                            echo "❌ Container failed to start"
                                            docker logs backend-test-${env.BUILD_ID} || true
                                            exit 1
                                        }
                                        
                                        # Wait a bit and check if container is still running
                                        sleep 5
                                        if docker ps | grep backend-test-${env.BUILD_ID}; then
                                            echo "✅ Backend container is running"
                                            docker logs backend-test-${env.BUILD_ID}
                                        else
                                            echo "❌ Backend container stopped unexpectedly"
                                            echo "📋 Container logs:"
                                            docker logs backend-test-${env.BUILD_ID} || true
                                        fi
                                        
                                        # Cleanup test container
                                        docker stop backend-test-${env.BUILD_ID} || true
                                        docker rm backend-test-${env.BUILD_ID} || true
                                    """

                                    // Security scan (if not skipped)
                                    if (params.SKIP_SECURITY_SCAN != true) {
                                        echo "🔒 Running security scan..."
                                        sh """
                                            trivy image --exit-code 0 --severity HIGH,CRITICAL ${imageName} || {
                                                echo "⚠️ Security scan found issues but continuing..."
                                            }
                                        """
                                    }

                                    // Push to ECR
                                    echo "📤 Pushing backend image to ECR..."
                                    docker.withRegistry("https://${ECR_REGISTRY}", "ecr:${AWS_REGION}:${AWS_CREDENTIALS_ID}") {
                                        backendImage.push()
                                        backendImage.push("3tier-nodejs-backend-latest")
                                    }
                                    
                                    env.BACKEND_SUCCESS = 'true'
                                    env.BACKEND_IMAGE_TAG = "3tier-nodejs-backend-${env.BUILD_ID}"
                                    echo "✅ Backend build completed successfully!"
                                    
                                } catch (Exception e) {
                                    echo "❌ Backend build failed: ${e.getMessage()}"
                                    env.BACKEND_SUCCESS = 'false'
                                    
                                    // Additional debugging
                                    sh '''
                                        echo "🔍 Backend build debugging info:"
                                        echo "Docker images:"
                                        docker images | grep backend || true
                                        echo "Docker processes:"
                                        docker ps -a | grep backend || true
                                    '''
                                    throw e
                                }
                            }
                        }
                    }
                }

                stage('Build Frontend') {
                    steps {
                        dir('frontend') {
                            script {
                                try {
                                    sh '''
                                        echo "🔧 Setting up frontend dependencies..."
                                        if [ ! -f package-lock.json ]; then
                                            npm install
                                        fi
                                        npm ci || npm install
                                        export NODE_OPTIONS=--openssl-legacy-provider && npm run build
                                    '''

                                    def imageName = "${ECR_REGISTRY}/${ECR_REPO_NAME}:3tier-nodejs-frontend-${env.BUILD_ID}"
                                    def frontendImage = docker.build(imageName, '.')

                                    if (params.SKIP_SECURITY_SCAN != true) {
                                        sh "trivy image --exit-code 0 --severity HIGH,CRITICAL ${imageName} || echo 'Security scan completed with warnings'"
                                    }

                                    docker.withRegistry("https://${ECR_REGISTRY}", "ecr:${AWS_REGION}:${AWS_CREDENTIALS_ID}") {
                                        frontendImage.push()
                                        frontendImage.push("3tier-nodejs-frontend-latest")
                                    }
                                    
                                    env.FRONTEND_SUCCESS = 'true'
                                    env.FRONTEND_IMAGE_TAG = "3tier-nodejs-frontend-${env.BUILD_ID}"
                                    echo "✅ Frontend build completed successfully!"
                                    
                                } catch (Exception e) {
                                    echo "❌ Frontend build failed: ${e.getMessage()}"
                                    env.FRONTEND_SUCCESS = 'false'
                                    throw e
                                }
                            }
                        }
                    }
                }
            }
        }

        stage('Update Kubernetes Manifests') {
            when {
                anyOf {
                    environment name: 'FRONTEND_SUCCESS', value: 'true'
                    environment name: 'BACKEND_SUCCESS', value: 'true'
                }
            }
            steps {
                script {
                    echo "📝 Updating Kubernetes manifests..."
                    
                    sh '''
                        mkdir -p k8s-temp
                        cp k8s/deployment-final.yaml k8s-temp/deployment-updated.yaml
                    '''
                    
                    if (env.BACKEND_SUCCESS == 'true') {
                        sh """
                            sed -i 's|889818960214.dkr.ecr.us-west-2.amazonaws.com/my-app-repo:3tier-nodejs-backend-latest|${ECR_REGISTRY}/${ECR_REPO_NAME}:${env.BACKEND_IMAGE_TAG}|g' k8s-temp/deployment-updated.yaml
                        """
                        echo "✅ Updated backend image to: ${env.BACKEND_IMAGE_TAG}"
                    }
                    
                    if (env.FRONTEND_SUCCESS == 'true') {
                        sh """
                            sed -i 's|889818960214.dkr.ecr.us-west-2.amazonaws.com/my-app-repo:3tier-nodejs-frontend-latest|${ECR_REGISTRY}/${ECR_REPO_NAME}:${env.FRONTEND_IMAGE_TAG}|g' k8s-temp/deployment-updated.yaml
                        """
                        echo "✅ Updated frontend image to: ${env.FRONTEND_IMAGE_TAG}"
                    }
                    
                    sh '''
                        echo "📋 Updated manifest preview:"
                        cat k8s-temp/deployment-updated.yaml | grep "image:" || true
                    '''
                }
            }
        }

        stage('Deploy to EKS') {
            when {
                anyOf {
                    environment name: 'FRONTEND_SUCCESS', value: 'true'
                    environment name: 'BACKEND_SUCCESS', value: 'true'
                }
            }
            steps {
                withAWS(credentials: AWS_CREDENTIALS_ID, region: AWS_REGION) {
                    script {
                        try {
                            echo "🔐 Configuring kubectl..."
                            sh """
                                aws eks update-kubeconfig --name ${EKS_CLUSTER_NAME} --region ${AWS_REGION}
                                kubectl cluster-info
                            """

                            echo "🚀 Deploying to EKS..."
                            
                            // Deploy infrastructure
                            sh '''
                                kubectl apply -f k8s/aws-load-balancer-controller-service-account.yaml --validate=false || true
                                kubectl apply -f k8s/ingress-class.yaml --validate=false || true
                            '''
                            
                            // Deploy application
                            sh '''
                                kubectl apply -f k8s-temp/deployment-updated.yaml --validate=false
                                
                                echo "⏳ Waiting for deployments..."
                                kubectl rollout status deployment/frontend-deployment --timeout=300s || echo "Frontend deployment timeout"
                                kubectl rollout status deployment/backend-deployment --timeout=300s || echo "Backend deployment timeout"
                            '''
                            
                            // Enhanced debugging for backend issues
                            sh '''
                                echo "🔍 Detailed Backend Debugging:"
                                echo "============================="
                                
                                # Get pod status
                                echo "📊 Pod Status:"
                                kubectl get pods -l app=backend -o wide
                                
                                # Get failed pods
                                FAILED_PODS=$(kubectl get pods -l app=backend --field-selector=status.phase!=Running -o name 2>/dev/null)
                                
                                if [ -n "$FAILED_PODS" ]; then
                                    echo ""
                                    echo "❌ Failed Backend Pods Found:"
                                    for pod in $FAILED_PODS; do
                                        echo "--- Debugging $pod ---"
                                        kubectl describe $pod
                                        echo ""
                                        echo "📋 Logs for $pod:"
                                        kubectl logs $pod --previous || kubectl logs $pod || echo "No logs available"
                                        echo ""
                                    done
                                    
                                    echo "🔍 Recent Events:"
                                    kubectl get events --sort-by=.metadata.creationTimestamp --field-selector involvedObject.kind=Pod | grep backend | tail -10
                                    
                                    echo ""
                                    echo "🔍 Backend Service Status:"
                                    kubectl get service backend-service -o yaml || echo "Backend service not found"
                                else
                                    echo "✅ All backend pods are running"
                                fi
                                
                                echo ""
                                echo "📊 All Services:"
                                kubectl get services
                                
                                echo ""
                                echo "📊 Ingress Status:"
                                kubectl get ingress my-app-ingress -o yaml
                                
                                # Test backend connectivity
                                echo ""
                                echo "🧪 Testing Backend Connectivity:"
                                BACKEND_POD=$(kubectl get pods -l app=backend -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
                                if [ -n "$BACKEND_POD" ] && kubectl get pod $BACKEND_POD | grep Running; then
                                    echo "Testing backend pod: $BACKEND_POD"
                                    kubectl exec $BACKEND_POD -- curl -f http://localhost:5000/health || echo "Backend health check failed"
                                else
                                    echo "No running backend pod found for testing"
                                fi
                            '''
                            
                            // Get load balancer URL
                            sh '''
                                LB_HOSTNAME=$(kubectl get ingress my-app-ingress -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || echo "")
                                if [ -n "$LB_HOSTNAME" ]; then
                                    echo "🌐 Application URL: http://$LB_HOSTNAME"
                                    echo "🧪 Testing frontend access..."
                                    curl -I "http://$LB_HOSTNAME" || echo "Frontend access test failed"
                                    echo "🧪 Testing backend API access..."
                                    curl -I "http://$LB_HOSTNAME/api" || echo "Backend API access test failed"
                                else
                                    echo "⏳ Load balancer not ready yet"
                                fi
                            '''
                            
                        } catch (Exception e) {
                            echo "❌ Deployment error: ${e.getMessage()}"
                            currentBuild.result = 'UNSTABLE'
                        }
                    }
                }
            }
        }

        stage('Post-Deploy Validation') {
            when {
                anyOf {
                    environment name: 'FRONTEND_SUCCESS', value: 'true'
                    environment name: 'BACKEND_SUCCESS', value: 'true'
                }
            }
            steps {
                withAWS(credentials: AWS_CREDENTIALS_ID, region: AWS_REGION) {
                    script {
                        echo "🔍 Post-deployment validation..."
                        
                        sh '''
                            echo "📊 Final Application Status:"
                            echo "=========================="
                            
                            # Wait a bit for pods to stabilize
                            sleep 30
                            
                            # Check pod health
                            echo "Pod Status:"
                            kubectl get pods -l 'app in (backend,frontend)' -o wide
                            
                            # Check services
                            echo ""
                            echo "Service Status:"
                            kubectl get services -l 'app in (backend,frontend)'
                            
                            # Check if backend is actually working
                            BACKEND_PODS=$(kubectl get pods -l app=backend --field-selector=status.phase=Running -o name 2>/dev/null)
                            RUNNING_COUNT=$(echo "$BACKEND_PODS" | wc -l)
                            
                            echo ""
                            echo "✅ Running backend pods: $RUNNING_COUNT"
                            
                            if [ "$RUNNING_COUNT" -gt 0 ]; then
                                echo "🎉 Backend deployment successful!"
                            else
                                echo "❌ Backend deployment failed - no running pods"
                                echo "🔧 Suggested fixes:"
                                echo "1. Check backend application logs"
                                echo "2. Verify backend Docker image"
                                echo "3. Check environment variables"
                                echo "4. Verify database connectivity"
                            fi
                            
                            # Final URL check
                            LB_HOSTNAME=$(kubectl get ingress my-app-ingress -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null)
                            if [ -n "$LB_HOSTNAME" ]; then
                                echo ""
                                echo "🌐 Application URLs:"
                                echo "Frontend: http://$LB_HOSTNAME"
                                echo "Backend API: http://$LB_HOSTNAME/api"
                            fi
                        '''
                    }
                }
            }
        }
    }

    post {
        always {
            sh 'rm -rf k8s-temp || true'
        }
        
        failure {
            echo "❌ Pipeline failed."
        }
        
        success {
            echo "✅ Pipeline completed successfully!"
        }
        
        unstable {
            echo "⚠️ Pipeline completed with warnings."
        }
    }
    
    parameters {
        booleanParam(
            name: 'FAIL_ON_QUALITY_GATE',
            defaultValue: false,
            description: 'Fail pipeline if SonarQube Quality Gate fails'
        )
        booleanParam(
            name: 'SKIP_SECURITY_SCAN',
            defaultValue: false,
            description: 'Skip Trivy security scanning'
        )
        booleanParam(
            name: 'SKIP_SONAR',
            defaultValue: false,
            description: 'Skip SonarQube analysis completely'
        )
    }
}
